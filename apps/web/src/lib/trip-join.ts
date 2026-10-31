/**
 * Ai được thêm 1 khách vào chuyến công tác (bảng thông báo chuyến sắp đi). Không import DB — dùng ở cả server lẫn giao diện.
 * - Admin: mọi trường hợp.
 * - NVKD phụ trách khách: tự tham gia hoặc nhờ NVKD khác đi hộ (người đi gặp = người được nhờ).
 * - Khách chưa phân: NVKD nào cũng nhận cho CHÍNH MÌNH (người đi gặp = mình, khách được gán cho mình).
 * - Người đăng ký chuyến: thêm khách của đồng nghiệp vào chuyến của mình với người đi gặp = mình (chủ khách được báo).
 */
export interface JoinCtx {
  callerId: string;
  isAdmin: boolean;
  tripOwnerId: string;
  customerOwnerId: string | null;
  attendeeId: string;
}

export function joinDenied(c: JoinCtx): string | null {
  if (c.isAdmin) return null;
  if (c.customerOwnerId === c.callerId) return null;
  if (c.customerOwnerId == null) return c.attendeeId === c.callerId ? null : "Khách chưa có người phụ trách: chỉ nhận cho chính mình được";
  if (c.tripOwnerId === c.callerId && c.attendeeId === c.callerId) return null;
  return "Chỉ NVKD phụ trách khách, người đăng ký chuyến hoặc admin mới thêm được khách này vào chuyến";
}
