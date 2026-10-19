import { NextRequest, NextResponse } from "next/server";
import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { getCustomerRiskReport } from "@/lib/customer-risk-query";
import { getCareOverview } from "@/lib/customer-care-query";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
/** Đã có ghi chăm sóc "vẫn mua bình thường" trong ngần này ngày thì không nhắc nguy cơ nữa. */
const SUPPRESS_NORMAL_DAYS = 30;
/** Đã có bất kỳ ghi chăm sóc nào trong ngần này ngày thì chưa nhắc lại. */
const SUPPRESS_ANY_DAYS = 7;

/**
 * Cho worker gọi hằng ngày: (1) khách nguy cơ cao/cảnh báo (theo nhịp đặt hàng) mà NVKD chưa chăm sóc gần đây;
 * (2) khách mua theo vụ tới lúc nhắc / lỡ vụ; (3) lời hẹn chăm sóc lại đến hạn. Worker tạo Notification từ đây
 * (xem apps/worker/src/notifications/customerAlerts.ts). Bảo vệ bằng INTERNAL_SYNC_TOKEN.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const now = new Date();

    // ----- (1) nguy cơ theo nhịp đặt hàng -----
    const report = await getCustomerRiskReport({});
    const customers = await prisma.customer.findMany({
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        careLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, outcome: true } },
      },
    });
    const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c]));
    const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c]));

    const risks = [];
    for (const r of report.rows) {
      if (!r.employeeId || (r.level !== "HIGH" && r.level !== "MEDIUM")) continue;
      const c = (r.customerCode && byCode.get(normalizeCustomerCode(r.customerCode))) || byName.get(r.customerName.trim().toLowerCase());
      if (!c) continue; // chưa có hồ sơ khách -> chưa ghi chăm sóc được
      const last = c.careLogs[0];
      if (last) {
        const age = (now.getTime() - last.createdAt.getTime()) / DAY_MS;
        if (age < SUPPRESS_ANY_DAYS || (last.outcome === "NORMAL" && age < SUPPRESS_NORMAL_DAYS)) continue;
      }
      risks.push({
        employeeId: r.employeeId,
        customerId: c.id,
        customerName: r.customerName,
        level: r.level,
        silentDays: r.silentDays,
        medianGapDays: r.medianGapDays,
        ratio: r.ratio,
        trendPct: r.trendPct,
        totalValue: r.totalValue,
      });
    }

    // ----- (2) khách theo vụ + (3) hẹn chăm sóc lại -----
    const overview = await getCareOverview({}, now);
    const seasons = overview
      .filter((c) => c.season && c.salesEmployee)
      .map((c) => ({
        employeeId: c.salesEmployee!.id,
        customerId: c.id,
        customerName: c.customerName,
        stage: c.season!.stage,
        season: c.season!.season,
        seasonMonth: c.season!.seasonMonth,
      }));
    const followUps = overview
      .filter((c) => c.salesEmployee && c.followUpAt && new Date(c.followUpAt).getTime() <= now.getTime())
      .map((c) => ({
        employeeId: c.salesEmployee!.id,
        customerId: c.id,
        customerName: c.customerName,
        followUpAt: c.followUpAt,
      }));

    // Trưởng phòng nhận bản nhắc leo thang (khách vụ ESCALATE/MISSED) và nguy cơ cao.
    const managers = await prisma.user.findMany({
      where: { role: "ADMIN", active: true, accessLevel: { in: ["FULL", "OPERATOR"] } },
      select: { id: true },
    });

    return NextResponse.json({ risks, seasons, followUps, managerIds: managers.map((m) => m.id) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/customer-alerts GET error", err);
    return NextResponse.json({ error: "Không lấy được cảnh báo khách hàng" }, { status: 500 });
  }
}
