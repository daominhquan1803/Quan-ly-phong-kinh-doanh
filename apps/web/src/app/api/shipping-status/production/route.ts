import { NextResponse } from "next/server";
import { prisma, normPoStatus, effectiveDeadline } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { daysUntilDeadline } from "@/lib/order-status";
import { progressFor, unmatchedLsx } from "@/lib/production-match";

export const dynamic = "force-dynamic";

/** Ngày mai theo giờ Việt Nam, "yyyy-mm-dd" (không phụ thuộc múi giờ của máy chủ). */
const vnTomorrow = () => new Date(Date.now() + (7 + 24) * 3_600_000).toISOString().slice(0, 10);

/** Tiến độ sản xuất của các dòng PO còn nợ hàng: ai cũng xem được, NVKD chỉ thấy hàng của mình. */
export async function GET() {
  try {
    const session = await requireSession();
    const rows = await prisma.productionLine.findMany();
    // Chưa đồng bộ lần nào thì không suy trạng thái, tránh báo nhầm mọi dòng là "chưa có lệnh".
    if (!rows.length) return NextResponse.json({ syncedAt: null, lines: [], unmatchedLsx: [] });

    const poLines = await prisma.poTrackingLine.findMany({
      where: { salesEmployeeId: { not: null }, ...scopeByOwner(session, "salesEmployeeId"), OR: [{ statusRaw: null }, { statusRaw: { not: "Kết thúc" } }] },
      select: { poCode: true, itemCode: true, itemName: true, customerCode: true, statusRaw: true, remainingQty: true, requestedDeliveryDate: true, delayReason: { select: { category: true, status: true, newDeliveryDate: true } }, salesEmployee: { select: { name: true } } },
    });
    const closed = normPoStatus("Kết thúc");
    const tomorrow = vnTomorrow();
    const lines = poLines
      .filter((l) => normPoStatus(l.statusRaw) !== closed)
      .map((l) => {
        const dueOn = effectiveDeadline(l.requestedDeliveryDate, l.delayReason);
        const daysLeft = daysUntilDeadline(dueOn);
        return {
          poCode: l.poCode,
          itemCode: l.itemCode,
          itemName: l.itemName,
          customerCode: l.customerCode,
          salesEmployeeName: l.salesEmployee?.name ?? null,
          remainingQty: l.remainingQty == null ? null : Number(l.remainingQty),
          dueOn,
          ...progressFor(l, rows, daysLeft, tomorrow),
        };
      })
      .sort((a, b) => (a.dueOn?.getTime() ?? Infinity) - (b.dueOn?.getTime() ?? Infinity));

    // Danh sách để đối chiếu số liệu: chỉ admin.
    let unmatched: { lsxNo: string; poCodes: string[]; itemCode: string; customerName: string | null }[] = [];
    if (session.user.role === "ADMIN") {
      const all = await prisma.poTrackingLine.findMany({ select: { poCode: true, itemCode: true, salesEmployeeId: true } });
      unmatched = unmatchedLsx(all.map((l) => ({ ...l, hasSalesEmployee: Boolean(l.salesEmployeeId) })), rows).map((r) => ({ lsxNo: r.lsxNo, poCodes: r.poCodes, itemCode: r.itemCode, customerName: r.customerName }));
    }

    return NextResponse.json({ syncedAt: rows[0].syncedAt, lines, unmatchedLsx: unmatched });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipping-status/production GET error", err);
    return NextResponse.json({ error: "Không tải được tiến độ sản xuất" }, { status: 500 });
  }
}
