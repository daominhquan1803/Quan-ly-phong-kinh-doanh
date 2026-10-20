import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { buildCustomerReport } from "@/lib/customer-report";
import { buildCustomerReportFile } from "@/lib/customer-report-workbook";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Tải Excel báo cáo Danh sách khách hàng, cùng phạm vi như trên app. Mặc định chỉ khách có đơn 12 tháng hoặc đã có hồ sơ /
 * đang chào giá; ?all=1 gồm mọi hồ sơ khách.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const params = new URL(req.url).searchParams;
    const isAdmin = session.user.role === "ADMIN";
    const employeeId = isAdmin ? params.get("employee") || undefined : session.user.id;
    const report = await buildCustomerReport({ employeeId });
    const rows = params.get("all") === "1" ? report.rows : report.rows.filter((r) => r.orders12 > 0 || !!r.stage || !!r.industry || r.stageSuggested === "QUOTED");
    const scopeLabel = employeeId ? report.employees.find((e) => e.id === employeeId)?.name ?? "NVKD" : "Cả phòng";
    const buf = await buildCustomerReportFile(report, rows, { scopeLabel });
    const ymd = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const name = `Danh-sach-khach-hang_${employeeId ? scopeLabel.replace(/\s+/g, "-") : "ca-phong"}_${ymd}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-report export error", err);
    return NextResponse.json({ error: "Không xuất được file Excel" }, { status: 500 });
  }
}
