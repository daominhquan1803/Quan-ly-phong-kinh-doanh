/**
 * Trạng thái công nợ 1 hoá đơn — dùng cho badge cảnh báo trên bảng Công nợ và tính tỉ lệ quá
 * hạn/nợ xấu ở phần tổng kết. Ngưỡng "Nợ xấu" = quá hạn > 180 ngày (anh Quân xác nhận). Ngưỡng
 * "Sắp đến hạn" = còn ≤ 7 ngày tới hạn — CHƯA hỏi lại anh Quân, tạm chọn 7 ngày cho hợp lý, có
 * thể chỉnh nếu cần khác.
 */
export type DebtStatus = "BAD_DEBT" | "OVERDUE" | "DUE_SOON" | "CURRENT" | "NO_DUE_DATE";

export const DEBT_BAD_DEBT_DAYS = 180;
const DUE_SOON_DAYS = 7;

export const DEBT_STATUS_LABEL: Record<DebtStatus, string> = {
  BAD_DEBT: "Nợ xấu",
  OVERDUE: "Quá hạn",
  DUE_SOON: "Sắp đến hạn",
  CURRENT: "Còn hạn",
  NO_DUE_DATE: "Chưa có hạn",
};

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

export function computeDebtStatus(invoice: {
  dueDate: Date | string | null;
  originalAmount: number;
  paidAmount: number;
}): DebtStatus {
  if (remainingAmount(invoice.originalAmount, invoice.paidAmount) <= 0) return "CURRENT";
  const days = overdueDays(invoice.dueDate);
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
