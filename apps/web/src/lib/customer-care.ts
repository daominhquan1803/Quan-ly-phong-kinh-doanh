/**
 * Ghi chăm sóc nhanh: NVKD chọn khách + kênh + 1 trong 6 kết quả (không gõ tự do). Cơ hội bán hàng là kết quả
 * NEW_NEED kèm 3 ô (nhóm SP, khoảng giá trị, tháng dự kiến). Xem agent-theo-doi-khach-hang/y-tuong-ghi-cham-soc.md.
 */
import { z } from "zod";

export const CARE_CHANNELS = ["CALL", "ZALO", "MEET"] as const;
export const CARE_OUTCOMES = ["NORMAL", "UPCOMING_ORDER", "NEW_NEED", "ISSUE", "NO_CONTACT", "LOST", "RESOLVED"] as const;
/** Kết quả bắt buộc ghi chú: có vấn đề (vấn đề gì), mất khách (vì sao), đã xử lý xong (xử lý thế nào). */
export const NOTE_REQUIRED: readonly string[] = ["ISSUE", "LOST", "RESOLVED"];
export const ISSUE_TYPES = ["PRICE", "QUALITY", "DELIVERY", "DEBT", "OTHER"] as const;
export const VALUE_BANDS = ["LT20", "20_100", "GT100"] as const;

export type CareChannelKey = (typeof CARE_CHANNELS)[number];
export type CareOutcomeKey = (typeof CARE_OUTCOMES)[number];

export const CARE_CHANNEL_LABEL: Record<CareChannelKey, string> = { CALL: "Gọi", ZALO: "Zalo", MEET: "Gặp" };
export const CARE_OUTCOME_LABEL: Record<CareOutcomeKey, string> = {
  NORMAL: "Vẫn mua bình thường",
  UPCOMING_ORDER: "Sắp có đơn",
  NEW_NEED: "Có nhu cầu mới",
  ISSUE: "Có vấn đề",
  NO_CONTACT: "Không liên lạc được",
  LOST: "Đã chuyển NCC khác",
  RESOLVED: "Đã xử lý xong vấn đề",
};
export const ISSUE_TYPE_LABEL: Record<(typeof ISSUE_TYPES)[number], string> = {
  PRICE: "Giá",
  QUALITY: "Chất lượng",
  DELIVERY: "Giao hàng",
  DEBT: "Công nợ",
  OTHER: "Khác",
};
export const VALUE_BAND_LABEL: Record<(typeof VALUE_BANDS)[number], string> = {
  LT20: "Dưới 20 triệu",
  "20_100": "20–100 triệu",
  GT100: "Trên 100 triệu",
};

/** Số ngày tự hẹn gọi lại khi "Không liên lạc được". */
export const NO_CONTACT_RETRY_DAYS = 3;

export const careLogSchema = z
  .object({
    customerId: z.string().trim().min(1, "Chưa chọn khách hàng"),
    channel: z.enum(CARE_CHANNELS),
    outcome: z.enum(CARE_OUTCOMES),
    note: z.string().trim().max(500).optional().nullable(),
    issueType: z.enum(ISSUE_TYPES).optional().nullable(),
    expectedMonth: z.number().int().min(1).max(12).optional().nullable(),
    needGroup: z.string().trim().max(100).optional().nullable(),
    needValueBand: z.enum(VALUE_BANDS).optional().nullable(),
    /** Số ngày hẹn chăm sóc lại (3 / 7 / 30...). */
    followUpDays: z.number().int().min(1).max(365).optional().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.outcome === "ISSUE" && !v.issueType) {
      ctx.addIssue({ code: "custom", path: ["issueType"], message: "Chọn lý do có vấn đề" });
    }
    if (NOTE_REQUIRED.includes(v.outcome) && !v.note?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: v.outcome === "RESOLVED" ? "Ghi rõ đã xử lý thế nào" : v.outcome === "LOST" ? "Ghi rõ vì sao khách chuyển NCC khác" : "Ghi rõ vấn đề của khách",
      });
    }
    if (v.outcome === "UPCOMING_ORDER" && !v.expectedMonth) {
      ctx.addIssue({ code: "custom", path: ["expectedMonth"], message: "Chọn tháng dự kiến có đơn" });
    }
  });

export type CareLogInput = z.infer<typeof careLogSchema>;

/** Chỉ giữ các trường có nghĩa với kết quả đã chọn — tránh lưu rác khi NVKD đổi ý giữa chừng. */
export function normalizeCareLog(input: CareLogInput, now: Date) {
  const o = input.outcome;
  const followUpDays = input.followUpDays ?? (o === "NO_CONTACT" ? NO_CONTACT_RETRY_DAYS : null);
  return {
    customerId: input.customerId,
    channel: input.channel,
    outcome: o,
    note: input.note?.trim() || null,
    issueType: o === "ISSUE" ? input.issueType ?? null : null,
    expectedMonth: o === "UPCOMING_ORDER" || o === "NEW_NEED" ? input.expectedMonth ?? null : null,
    needGroup: o === "NEW_NEED" ? input.needGroup?.trim() || null : null,
    needValueBand: o === "NEW_NEED" ? input.needValueBand ?? null : null,
    followUpAt: followUpDays ? new Date(now.getTime() + followUpDays * 86_400_000) : null,
  };
}
