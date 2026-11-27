import { prisma, normPoStatus, effectiveDeadline } from "@hoanggia/db";
import { daysUntilDeadline } from "@/lib/order-status";
import { progressFor } from "@/lib/production-match";

/** Ngày mai theo giờ Việt Nam, "yyyy-mm-dd" (không phụ thuộc múi giờ của máy chủ). */
const vnTomorrow = () => new Date(Date.now() + (7 + 24) * 3_600_000).toISOString().slice(0, 10);

/**
 * Các dòng PO còn nợ hàng kèm tiến độ sản xuất — dùng CHUNG cho tab "Tiến độ hàng hoá" và tin nhắc 8h,
 * để hai nơi không lệch số. `where` giới hạn phạm vi (vd NVKD đang đăng nhập).
 */
export async function loadProductionLines(where: Record<string, unknown> = {}) {
  const rows = await prisma.productionLine.findMany();
  // Chưa đồng bộ lần nào thì không suy trạng thái, tránh báo nhầm mọi dòng là "chưa có lệnh".
  if (!rows.length) return { rows, syncedAt: null, dataSince: null, lines: [] };

  const poLines = await prisma.poTrackingLine.findMany({
    where: { salesEmployeeId: { not: null }, ...where, OR: [{ statusRaw: null }, { statusRaw: { not: "Kết thúc" } }] },
    select: { poCode: true, poDate: true, itemCode: true, itemName: true, customerCode: true, statusRaw: true, remainingQty: true, requestedDeliveryDate: true, delayReason: { select: { category: true, status: true, newDeliveryDate: true } }, salesEmployeeId: true, salesEmployee: { select: { name: true } } },
  });
  const closed = normPoStatus("Kết thúc");
  const tomorrow = vnTomorrow();
  const dataSince = rows.reduce<Date | null>((min, r) => (r.orderedOn && (!min || r.orderedOn < min) ? r.orderedOn : min), null);
  const lines = poLines
    .filter((l) => normPoStatus(l.statusRaw) !== closed)
    .map((l) => {
      const dueOn = effectiveDeadline(l.requestedDeliveryDate, l.delayReason);
      return {
        poCode: l.poCode,
        itemCode: l.itemCode,
        itemName: l.itemName,
        customerCode: l.customerCode,
        salesEmployeeId: l.salesEmployeeId,
        salesEmployeeName: l.salesEmployee?.name ?? null,
        remainingQty: l.remainingQty == null ? null : Number(l.remainingQty),
        dueOn,
        ...progressFor(l, rows, daysUntilDeadline(dueOn), tomorrow, dataSince),
      };
    })
    .sort((a, b) => (a.dueOn?.getTime() ?? Infinity) - (b.dueOn?.getTime() ?? Infinity));

  return { rows, syncedAt: rows[0].syncedAt, dataSince, lines };
}
