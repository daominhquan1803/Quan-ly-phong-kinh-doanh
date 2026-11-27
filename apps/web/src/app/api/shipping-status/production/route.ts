import { NextResponse } from "next/server";
import { prisma, normPoStatus } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { matchReport } from "@/lib/production-match";

export const dynamic = "force-dynamic";

/** Đối chiếu dòng PO còn nợ hàng với lệnh sản xuất đã đồng bộ (đợt 1: chỉ admin xem để kiểm tra số liệu). */
export async function GET() {
  try {
    await requireAdmin();
    const [rows, poLines] = await Promise.all([
      prisma.productionLine.findMany(),
      prisma.poTrackingLine.findMany({
        select: { poCode: true, itemCode: true, itemName: true, customerCode: true, statusRaw: true, remainingQty: true, requestedDeliveryDate: true, salesEmployeeId: true, salesEmployee: { select: { name: true } } },
      }),
    ]);
    const closed = normPoStatus("Kết thúc");
    const lines = poLines.map((l) => ({ ...l, open: normPoStatus(l.statusRaw) !== closed, hasSalesEmployee: Boolean(l.salesEmployeeId) }));
    const report = matchReport(lines, rows);
    return NextResponse.json({
      syncedAt: rows[0]?.syncedAt ?? null,
      lsxRows: rows.length,
      openProduction: report.openProduction,
      matched: report.matched,
      trading: report.trading,
      withoutLsx: report.withoutLsx.map((l) => ({
        poCode: l.poCode,
        itemCode: l.itemCode,
        itemName: l.itemName,
        customerCode: l.customerCode,
        salesEmployeeName: l.salesEmployee?.name ?? null,
        remainingQty: l.remainingQty == null ? null : Number(l.remainingQty),
        dueOn: l.requestedDeliveryDate,
      })),
      unmatchedLsx: report.unmatchedLsx.map((r) => ({ lsxNo: r.lsxNo, poCodes: r.poCodes, itemCode: r.itemCode, customerName: r.customerName })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipping-status/production GET error", err);
    return NextResponse.json({ error: "Không đối chiếu được lệnh sản xuất" }, { status: 500 });
  }
}
