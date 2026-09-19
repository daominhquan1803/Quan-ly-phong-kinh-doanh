const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sửa ngày bị ĐẢO ngày/tháng khi NVKD gõ dd/mm vào Excel cài định dạng Mỹ (mm/dd): gõ "3/9" (3
 * tháng 9) bị Excel hiểu là 9 tháng 3 và lưu thành ô ngày THẬT — từ giá trị ô không phân biệt được
 * với ngày đúng. Chỉ ngày có ngày = tháng (vd 9/9) là vô tình vẫn đúng; đã gặp thật ở file kết quả
 * Kế hoạch tuần (18-19/09/2026): các dòng tuần 1 tháng 9 lưu thành 09/03, 09/04, 09/05, 09/07,
 * 09/12 nên chỉ ngày 09/09 rơi vào tuần 1.
 *
 * Kết quả kế hoạch tuần luôn là ngày gần thời điểm tải file — nên chỉ đảo lại khi ngày đọc được
 * cách `reference` (thời điểm tải file) hơn `windowDays` ngày MÀ bản đảo lại thì nằm trong
 * `windowDays` ngày. Ngày đọc được đã gần `reference` thì giữ nguyên.
 * ponytail: heuristic theo khoảng cách — 1 dòng lịch sử thật (cũ hơn windowDays) có ngày ≤ 12 mà bản
 * đảo lại tình cờ nằm gần hiện tại sẽ bị đảo nhầm; nơi gọi phải báo số dòng đã đảo cho người dùng.
 */
export function fixSwappedDayMonth(
  date: Date,
  reference: Date,
  windowDays = 45
): { date: Date; swapped: boolean } {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  if (d > 12 || d === m) return { date, swapped: false };
  const swappedDate = new Date(date.getFullYear(), d - 1, m);
  if (swappedDate.getDate() !== m) return { date, swapped: false };
  const dist = (x: Date) => Math.abs(x.getTime() - reference.getTime()) / DAY_MS;
  if (dist(date) > windowDays && dist(swappedDate) <= windowDays) return { date: swappedDate, swapped: true };
  return { date, swapped: false };
}
