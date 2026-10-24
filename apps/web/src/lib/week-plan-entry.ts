/**
 * Dòng "khách hàng liên hệ mới / hẹn gặp mới" của Kế hoạch tuần phải ĐỦ thông tin mới được tính (anh Quân chốt
 * 24/10/2026): công ty, địa chỉ, quốc tịch, quy mô, người liên hệ + SĐT, nhu cầu, việc đã làm, hành động tiếp theo
 * kèm ngày hẹn nhắc. Dòng ghi trước 26/10/2026 giữ nguyên và vẫn tính, để điểm tuần/KPI đã chốt không đổi.
 */
import { z } from "zod";
import { STAFF_SIZES } from "./customer-profile";

export const WEEK_ENTRY_COMPLETE_FROM = new Date("2026-10-26T00:00:00+07:00");

export const NATIONALITIES = ["Việt Nam", "Hàn Quốc", "Nhật Bản", "Đài Loan", "Trung Quốc", "Khác"] as const;
export const SCALE_KEYS = Object.keys(STAFF_SIZES) as [string, ...string[]];
export const SCALE_LABEL: Record<string, string> = STAFF_SIZES;

/** SĐT Việt Nam hoặc quốc tế: 8–15 chữ số, cho phép +, khoảng trắng, chấm, gạch, ngoặc. */
export const isPhone = (s: string) => {
  const digits = s.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && /^[\d+\s().-]+$/.test(s);
};

export interface EntryFields {
  entryDate: Date;
  customerName: string;
  address: string | null;
  nationality: string | null;
  scale: string | null;
  contactName: string | null;
  contactPhone: string | null;
  need: string | null;
  workDone: string | null;
  nextAction: string | null;
  nextActionAt: Date | null;
}

const REQUIRED: { key: keyof EntryFields; label: string }[] = [
  { key: "customerName", label: "tên công ty" },
  { key: "address", label: "địa chỉ" },
  { key: "nationality", label: "quốc tịch" },
  { key: "scale", label: "quy mô" },
  { key: "contactName", label: "người liên hệ" },
  { key: "contactPhone", label: "số điện thoại" },
  { key: "need", label: "nhu cầu" },
  { key: "workDone", label: "việc đã làm" },
  { key: "nextAction", label: "hành động tiếp theo" },
  { key: "nextActionAt", label: "ngày hẹn nhắc" },
];

/** Các mục còn thiếu của 1 dòng (rỗng = đủ). */
export function missingFields(e: EntryFields): string[] {
  return REQUIRED.filter(({ key }) => {
    const v = e[key];
    if (v == null) return true;
    if (typeof v === "string") return !v.trim() || (key === "contactPhone" && !isPhone(v));
    return false;
  }).map((r) => r.label);
}

/** Dòng này có được tính vào số "thực tế" không: dòng cũ (trước mốc) luôn tính; dòng mới phải đủ thông tin. */
export function entryCounts(e: EntryFields): boolean {
  return e.entryDate < WEEK_ENTRY_COMPLETE_FROM || missingFields(e).length === 0;
}

/** Schema ghi dòng mới: từ mốc 26/10/2026 mọi trường đều bắt buộc; dòng ghi bù cho ngày cũ chỉ cần tên khách. */
export const entryDetailSchema = z.object({
  address: z.string().trim().max(500).optional().nullable(),
  nationality: z.enum(NATIONALITIES).optional().nullable(),
  scale: z.enum(SCALE_KEYS).optional().nullable(),
  contactName: z.string().trim().max(255).optional().nullable(),
  contactPhone: z.string().trim().max(50).optional().nullable(),
  need: z.string().trim().max(1000).optional().nullable(),
  workDone: z.string().trim().max(1000).optional().nullable(),
  nextAction: z.string().trim().max(1000).optional().nullable(),
  nextActionAt: z.string().optional().nullable(),
});

export type EntryDetailInput = z.infer<typeof entryDetailSchema>;

/** Lỗi đầu tiên (tiếng Việt) nếu dòng mới ghi từ mốc 26/10/2026 mà chưa đủ; null = hợp lệ. */
export function validateNewEntry(entryDate: Date, customerName: string, d: EntryDetailInput): string | null {
  if (entryDate < WEEK_ENTRY_COMPLETE_FROM) return null;
  const nextActionAt = d.nextActionAt ? new Date(d.nextActionAt) : null;
  if (nextActionAt && Number.isNaN(nextActionAt.getTime())) return "Ngày hẹn nhắc không hợp lệ";
  const miss = missingFields({
    entryDate,
    customerName,
    address: d.address ?? null,
    nationality: d.nationality ?? null,
    scale: d.scale ?? null,
    contactName: d.contactName ?? null,
    contactPhone: d.contactPhone ?? null,
    need: d.need ?? null,
    workDone: d.workDone ?? null,
    nextAction: d.nextAction ?? null,
    nextActionAt,
  });
  if (miss.length) return `Chưa đủ thông tin: thiếu ${miss.join(", ")}`;
  if (nextActionAt && nextActionAt < new Date(entryDate.getFullYear(), entryDate.getMonth(), entryDate.getDate())) {
    return "Ngày hẹn nhắc không được trước ngày ghi nhận";
  }
  return null;
}

/** Gộp tên + SĐT vào contactInfo cũ để các chỗ hiển thị/Excel cũ vẫn thấy. */
export const contactInfoOf = (name: string | null, phone: string | null) => [name, phone].filter(Boolean).join(" - ") || null;
