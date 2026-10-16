/**
 * Trạng thái công nợ 1 hoá đơn — dùng cho badge cảnh báo trên bảng Công nợ và tính tỉ lệ quá
 * hạn/nợ xấu ở phần tổng kết. Ngưỡng "Nợ xấu" = quá hạn > 180 ngày (anh Quân xác nhận). Ngưỡng
 * "Sắp đến hạn" = còn ≤ 7 ngày tới hạn — CHƯA hỏi lại anh Quân, tạm chọn 7 ngày cho hợp lý, có
 * thể chỉnh nếu cần khác.
 */
export type DebtStatus = "BAD_DEBT" | "OVERDUE" | "DUE_SOON" | "CURRENT" | "NO_DUE_DATE" | "PAID";

export const DEBT_BAD_DEBT_DAYS = 180;
const DUE_SOON_DAYS = 7;

export const DEBT_STATUS_LABEL: Record<DebtStatus, string> = {
  BAD_DEBT: "Nợ xấu",
  OVERDUE: "Quá hạn",
  DUE_SOON: "Sắp đến hạn",
  CURRENT: "Còn hạn",
  NO_DUE_DATE: "Chưa có hạn",
  PAID: "Đã thanh toán",
};

/**
 * Khách có nợ xấu được THEO DÕI RIÊNG (anh Quân chốt 16/10/2026): khoản nợ xấu (> 180 ngày) của các
 * khách này vẫn nằm trong "Nợ xấu" và "Tổng công nợ" nhưng KHÔNG tính vào "Quá hạn" / tỉ lệ nợ quá hạn,
 * và KHÔNG gửi thư nhắc nợ cho họ (xem api/internal/debt-due-soon). Hoá đơn của họ chưa tới mức nợ xấu
 * (≤ 180 ngày) vẫn tính quá hạn bình thường. So khớp theo mã khách trên hoá đơn công nợ (viết hoa).
 * Muốn thêm/bớt khách: sửa danh sách này.
 */
export const SEPARATE_BAD_DEBT_CUSTOMERS: readonly string[] = ["LOGISTIC-SC", "SUA-TH", "DP-PULIPHA", "LICOGI"];

export function isSeparateCustomer(customerCode: string | null | undefined): boolean {
  return !!customerCode && SEPARATE_BAD_DEBT_CUSTOMERS.includes(customerCode.trim().toUpperCase());
}

export function isSeparateBadDebt(status: DebtStatus, customerCode: string | null | undefined): boolean {
  return status === "BAD_DEBT" && isSeparateCustomer(customerCode);
}

/** Có tính vào "Quá hạn" không: quá hạn hoặc nợ xấu, trừ nợ xấu của khách theo dõi riêng. */
export function countsAsOverdue(status: DebtStatus, customerCode: string | null | undefined): boolean {
  return (status === "OVERDUE" || status === "BAD_DEBT") && !isSeparateBadDebt(status, customerCode);
}

/** remainingAmount = originalAmount - paidAmount — luôn tính tại chỗ, không lưu cột riêng. */
export function remainingAmount(originalAmount: number, paidAmount: number): number {
  return Math.max(0, originalAmount - paidAmount);
}

export function overdueDays(dueDate: Date | string | null, today: Date = new Date()): number | null {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  const t = new Date(today);
  due.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
}

/** `asOf`: mốc ngày để tính "quá hạn bao nhiêu ngày" — mặc định hôm nay; truyền ngày khác để xem
 * công nợ "tại thời điểm" quá khứ (vd xem công nợ như thế nào vào ngày 30/09). */
export function computeDebtStatus(
  invoice: {
    dueDate: Date | string | null;
    originalAmount: number;
    paidAmount: number;
  },
  asOf: Date = new Date()
): DebtStatus {
  if (remainingAmount(invoice.originalAmount, invoice.paidAmount) <= 0) return "PAID";
  const days = overdueDays(invoice.dueDate, asOf);
  if (days === null) return "NO_DUE_DATE";
  if (days > DEBT_BAD_DEBT_DAYS) return "BAD_DEBT";
  if (days > 0) return "OVERDUE";
  if (days >= -DUE_SOON_DAYS) return "DUE_SOON";
  return "CURRENT";
}

/** Thứ 2 của tuần dương lịch chứa ngày `d` (tuần dương lịch Thứ 2 - Chủ nhật, anh Quân xác nhận). */
export function mondayOfWeek(d: Date): Date {
  const day = d.getDay(); // 0=CN..6=T7
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() + diff);
  return monday;
}

/** Thứ 2 của "Tuần N" trong 1 tháng cụ thể — tuần 1 luôn là tuần dương lịch chứa ngày 1 đầu
 * tháng, tuần 2-5 nối tiếp mỗi 7 ngày (giống hệt cách chia tuần ở /api/debt/summary). Dùng để quy
 * đổi "Kế hoạch thu Tuần 1-5" trong file Công nợ gốc thành 1 ngày dự kiến thanh toán cụ thể. */
export function monthWeekMonday(year: number, month: number, weekIndex: number): Date {
  const monthStart = new Date(year, month - 1, 1);
  const week1Monday = mondayOfWeek(monthStart);
  const monday = new Date(week1Monday);
  monday.setDate(monday.getDate() + (weekIndex - 1) * 7);
  return monday;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Chia 1 tháng thành tối đa 5 "tuần" để khớp cột "Tuần 1-5" của file Công nợ gốc — tuần giữa là
 * tuần dương lịch đầy đủ (Thứ 2 - Chủ nhật), nhưng tuần ĐẦU và tuần CUỐI bị CẮT đúng theo ranh
 * giới tháng (không tràn sang tháng trước/sau). Trước đây tuần 1 lấy nguyên tuần dương lịch chứa
 * ngày 1 (có thể bắt đầu từ cuối tháng trước) — anh Quân báo lỗi: "Tuần 1 tháng 10" hiện sai
 * thành 28/09-04/10, đúng phải là 01/10-04/10 (và phần 28-30/09 đó thuộc "Tuần 5 tháng 9"). */
export function monthWeekBuckets(year: number, month: number): { weekIndex: number; start: Date; end: Date }[] {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const buckets: { weekIndex: number; start: Date; end: Date }[] = [];
  let cursor = mondayOfWeek(monthStart);
  let weekIndex = 1;
  while (cursor <= monthEnd && weekIndex <= 5) {
    const rawEnd = addDays(cursor, 6);
    buckets.push({
      weekIndex,
      start: cursor < monthStart ? monthStart : cursor,
      end: rawEnd > monthEnd ? monthEnd : rawEnd,
    });
    cursor = addDays(cursor, 7);
    weekIndex++;
  }
  return buckets;
}
