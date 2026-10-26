import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { buildCustomerReport } from "@/lib/customer-report";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Chỉ đọc — tóm tắt báo cáo hiện tại để kiểm tra (không ghi gì). */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const t = Date.now();
    const report = await buildCustomerReport({});
    const count = (f: (r: (typeof report.rows)[number]) => string) => report.rows.reduce<Record<string, number>>((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
    return NextResponse.json({
      ms: Date.now() - t,
      customers: report.rows.length,
      buyers12: report.rows.filter((r) => r.orders12 > 0).length,
      withAutoAddress: report.rows.filter((r) => r.addressAuto).length,
      stages: count((r) => r.stageEffective),
      statuses: count((r) => r.status),
      summary: report.summary,
      unclassifiedItems: report.unclassifiedItems.length,
      unclassified: new URL(req.url).searchParams.get("items") === "1" ? report.unclassifiedItems.map((u) => ({ ...u, value12: Math.round(u.value12) })) : undefined,
      sample: report.rows.filter((r) => r.orders12 > 0).sort((a, b) => b.value12 - a.value12).slice(0, 3).map((r) => ({ code: r.customerCode, groups: r.groupsText, stage: r.stageSuggested, status: r.status, province: r.province })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-report-snapshot GET error", err);
    return NextResponse.json({ error: "Lỗi" }, { status: 500 });
  }
}

/** Worker gọi ngày 1 hằng tháng: chụp tiến trình / tình trạng từng khách làm số "cuối tháng trước" để so sánh. Gọi lại thì ghi đè. */
export async function POST(req: NextRequest) {
  try {
    requireInternalToken(req);
    const now = new Date();
    const vn = new Date(now.getTime() + 7 * 3600_000);
    const year = vn.getUTCMonth() === 0 ? vn.getUTCFullYear() - 1 : vn.getUTCFullYear();
    const month = vn.getUTCMonth() === 0 ? 12 : vn.getUTCMonth();
    const report = await buildCustomerReport({}, now);
    const rows = report.rows.map((r) => ({
      code: r.customerCode,
      stage: r.stageEffective,
      status: r.status,
      value12: Math.round(r.value12),
      completeness: r.completeness,
      employeeId: r.employeeId,
    }));
    await prisma.customerReportSnapshot.upsert({ where: { year_month: { year, month } }, create: { year, month, rows }, update: { rows } });
    return NextResponse.json({ year, month, customers: rows.length });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-report-snapshot error", err);
    return NextResponse.json({ error: "Không chụp được báo cáo" }, { status: 500 });
  }
}
