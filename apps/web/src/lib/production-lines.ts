import { prisma, normPoStatus, effectiveDeadline } from "@hoanggia/db";
import { daysUntilDeadline } from "@/lib/order-status";
import { progressFor } from "@/lib/production-match";

/** Ngày mai theo giờ Việt Nam, "yyyy-mm-dd" (không phụ thuộc múi giờ của máy chủ). */
const vnTomorrow = () => new Date(Date.now() + (7 + 24) * 3_600_000).toISOString().slice(0, 10);

/** Ngày lệnh sớm nhất bên trang sản xuất = từ đó mới có dữ liệu. */
const firstOrderedOn = (rows: { orderedOn: Date | null }[]) =>
  rows.reduce<Date | null>((min, r) => (r.orderedOn && (!min || r.orderedOn < min) ? r.orderedOn : min), null);

/**
 * Bộ lọc cho thống kê trễ: dòng HÀNG SẢN XUẤT đặt trước khi trang sản xuất có dữ liệu và không có lệnh thì không
 * tính trễ (PO cũ đã giao nhưng chưa đóng trên app). Hàng thương mại vẫn tính trễ như thường.
 */
export async function loadOldPoFilter() {
  const rows = await prisma.productionLine.findMany();
  const dataSince = firstOrderedOn(rows);
  let count = 0;
  return {
    ignore(line: { poCode: string; itemCode: string | null; poDate: Date | null }) {
      const old = progressFor(line, rows, null, "", dataSince).status === "OLD_PO";
      if (old) count++;
      return old;
    },
    /** Số dòng đã bỏ khỏi thống kê trễ (đọc SAU khi đã lọc). */
    count: () => count,
  };
}

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
  const dataSince = firstOrderedOn(rows);
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
    // Trang sản xuất không có dữ liệu hàng thương mại nên không thống kê ở đây.
    .filter((l) => l.status !== "TRADING")
    .sort((a, b) => (a.dueOn?.getTime() ?? Infinity) - (b.dueOn?.getTime() ?? Infinity));

  return { rows, syncedAt: rows[0].syncedAt, dataSince, lines };
}
