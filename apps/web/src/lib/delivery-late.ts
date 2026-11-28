/**
 * Định nghĩa "trễ" dùng chung (anh Quân chốt 28/11/2026):
 * - Trễ = quá ngày hạn giao hiệu lực (hạn mới nếu khách đổi lịch đã duyệt) mà chưa giao, KỂ CẢ hàng đã sản xuất xong.
 * - Hàng sản xuất của PO cũ chưa có lệnh sản xuất: không thống kê trễ.
 * - Đơn bấm "Kết thúc đơn" trước hoặc đúng hạn (hoặc app tự đóng): bỏ khỏi thống kê. Đóng SAU hạn: vẫn trễ.
 */
const VN = 7 * 3_600_000;
const DAY = 86_400_000;

/** Mốc loại trừ của ngày hạn: 00:00 giờ VN của ngày kế tiếp. */
export const dueEndOf = (due: Date) => (Math.floor((due.getTime() + VN) / DAY) + 1) * DAY - VN;

export interface ManualClose {
  manuallyClosed?: boolean;
  manuallyClosedAt?: Date | null;
  manuallyClosedByUserId?: string | null; // null = app tự đóng
}

export const closedInTime = (c: ManualClose, due: Date) =>
  !!c.manuallyClosed && (!c.manuallyClosedByUserId || !c.manuallyClosedAt || c.manuallyClosedAt.getTime() < dueEndOf(due));

export interface RateLine extends ManualClose {
  dueOn: Date | null;
  isOpen: boolean;
  poQuantity: number | null;
  deliveredQty: number;
  lastDeliveryOn: Date | null;
  oldPo: boolean;
}

/**
 * Tỷ lệ giao đúng hạn theo DÒNG HÀNG có ngày hạn đã qua, từ `since` đến `now`. Dòng quá hạn còn mở tính là chưa đúng
 * hạn. Dòng đã đóng mà không có đợt giao nào thì không đủ dữ liệu, bỏ ra.
 */
export function onTimeRate(lines: RateLine[], since: Date, now: Date) {
  let onTime = 0;
  let total = 0;
  for (const l of lines) {
    if (!l.dueOn || l.dueOn < since || dueEndOf(l.dueOn) > now.getTime()) continue;
    const full = !!l.poQuantity && l.deliveredQty >= l.poQuantity;
    if (l.isOpen || (l.manuallyClosed && !full)) {
      // Chưa giao đủ: là chưa đúng hạn, trừ PO cũ chưa có lệnh và đơn đã đóng kịp hạn.
      if (!l.oldPo && (l.isOpen || !closedInTime(l, l.dueOn))) total++;
    } else if (l.lastDeliveryOn) {
      total++;
      if (l.lastDeliveryOn.getTime() < dueEndOf(l.dueOn)) onTime++;
    }
  }
  return { onTime, total, pct: total ? Math.round((onTime / total) * 100) : null };
}
