/**
 * Ai nộp báo cáo điểm dừng nào (anh Quân chốt 31/10/2026: điểm dừng nào cũng phải có báo cáo của chính điểm dừng đó).
 * - Người đi gặp (không phải chủ đăng ký): chỉ nộp các điểm dừng của mình, phải nộp đủ các điểm dừng đó.
 * - Chủ đăng ký / admin: nộp được mọi điểm dừng; phải nộp đủ các điểm dừng CHƯA có báo cáo của người đi gặp khác
 *   (điểm dừng người khác đã tự báo cáo thì không bắt buộc nộp lại). Điểm dừng cũ (không có người đi gặp) do chủ đăng ký nộp như trước.
 * Không import DB — dùng ở server và giao diện.
 */
export interface ScopeStop {
  id: string;
  attendeeId: string | null;
  outcome: string | null;
}

export function reportScope(trip: { employeeId: string; stops: ScopeStop[] }, userId: string, isAdmin: boolean): { allowed: Set<string>; required: Set<string> } {
  if (isAdmin || trip.employeeId === userId) {
    return {
      allowed: new Set(trip.stops.map((s) => s.id)),
      required: new Set(trip.stops.filter((s) => !(s.attendeeId && s.attendeeId !== trip.employeeId && s.outcome != null)).map((s) => s.id)),
    };
  }
  const mine = trip.stops.filter((s) => s.attendeeId === userId).map((s) => s.id);
  return { allowed: new Set(mine), required: new Set(mine) };
}

/** Sau lần nộp này mọi điểm dừng của chuyến đã có kết quả -> chuyến mới chuyển sang chờ duyệt. */
export const reportComplete = (stops: { id: string; outcome: string | null }[], reportedNow: Set<string>) =>
  stops.every((s) => s.outcome != null || reportedNow.has(s.id));
