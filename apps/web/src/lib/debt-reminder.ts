import { z } from "zod";
import { overdueDays, remainingAmount } from "./debt-status";

/**
 * Mốc gửi thư nhắc lịch thanh toán công nợ cho khách (anh Quân chốt 3 mốc): "D7" = còn ĐÚNG 7 ngày
 * tới hạn, "D0" = ĐÚNG ngày đến hạn, "OVERDUE" = quá hạn ĐÚNG bội số của 7 ngày (1, 8, 15, …) — thư
 * quá hạn GỬI LẶP LẠI mỗi 7 ngày, không giới hạn số lần (xem reminderOccurrence). Mọi nguồn hoá đơn
 * (kể cả BASELINE) đều được nhắc. Chống trùng bằng bảng DebtReminderLog, khoá gồm CẢ occurrence
 * (xem schema.prisma).
 */
export type DebtReminderMilestone = "D7" | "D0" | "OVERDUE";

/** Nhắc trước hạn 7 ngày (anh Quân chốt). Độc lập với DUE_SOON_DAYS của badge "Sắp đến hạn". */
export const DEBT_REMINDER_DAYS_BEFORE = 7;

export const DEBT_REMINDER_MILESTONE_LABEL: Record<DebtReminderMilestone, string> = {
  D7: "Trước hạn 7 ngày",
  D0: "Đúng ngày đến hạn",
  OVERDUE: "Quá hạn",
};

/** Chu kỳ nhắc lại thư quá hạn (anh Quân chốt: mỗi 7 ngày quá hạn tăng 1 lần nhắc). */
export const DEBT_OVERDUE_REPEAT_DAYS = 7;

export interface RemindableInvoice {
  dueDate: Date | string | null;
  originalAmount: number;
  paidAmount: number;
}

/**
 * Mốc nhắc của 1 hoá đơn HÔM NAY, null = hôm nay không nhắc hoá đơn này. Mọi so sánh ngày đi qua
 * overdueDays() (cùng ngày-lịch địa phương, TZ=Asia/Ho_Chi_Minh của container) — không tự trừ
 * timestamp UTC.
 */
export function reminderMilestoneFor(invoice: RemindableInvoice, today: Date = new Date()): DebtReminderMilestone | null {
  if (remainingAmount(invoice.originalAmount, invoice.paidAmount) <= 0) return null;
  const days = overdueDays(invoice.dueDate, today);
  if (days === null) return null;
  if (days === -DEBT_REMINDER_DAYS_BEFORE) return "D7";
  if (days === 0) return "D0";
  if (days >= 1 && (days - 1) % DEBT_OVERDUE_REPEAT_DAYS === 0) return "OVERDUE";
  return null;
}

/** Lần nhắc của mốc: D7/D0 luôn 1; OVERDUE = floor((days − 1)/7) + 1 (days = overdueDays, >= 1). */
export function reminderOccurrence(milestone: DebtReminderMilestone, days: number): number {
  if (milestone !== "OVERDUE") return 1;
  return Math.floor((days - 1) / DEBT_OVERDUE_REPEAT_DAYS) + 1;
}

/** Tách chuỗi nhiều email ("a@x.com; b@y.com") thành mảng đã trim, bỏ phần rỗng. */
export function parseEmailList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Chuẩn hoá chuỗi email để LƯU vào Customer.email — join(", "), giữ nguyên hoa/thường. */
export function normalizeEmailList(raw: string | null | undefined): string | null {
  const list = parseEmailList(raw);
  return list.length > 0 ? list.join(", ") : null;
}

const emailSchema = z.string().email();

/** Địa chỉ đơn lẻ có hợp lệ không — dùng ở mọi biên nhận email (nhập tay, import, gửi thư). */
export function isValidEmail(address: string): boolean {
  return emailSchema.safeParse(address).success;
}

/** Địa chỉ sai đầu tiên trong chuỗi nhiều email, undefined nếu tất cả hợp lệ (hoặc chuỗi rỗng). */
export function findInvalidEmail(raw: string | null | undefined): string | undefined {
  return parseEmailList(raw).find((a) => !isValidEmail(a));
}

/** Field zod cho Customer.email ở các API nhập tay — validate TỪNG địa chỉ: sai địa chỉ = thư bay ra
 * ngoài cho người lạ. */
export const emailListField = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .superRefine((val, ctx) => {
    const bad = findInvalidEmail(val);
    if (bad) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Email không hợp lệ: ${bad}` });
  });
