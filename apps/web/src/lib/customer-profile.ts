import { z } from "zod";

/**
 * Hồ sơ khách cho báo cáo "Danh sách khách hàng" (anh Quân chốt 20/10/2026). Dùng chung server + client (không import DB).
 * Danh mục cố định để lọc / phân tích được; NVKD chọn trên app hoặc ô chọn trong file Excel.
 */
export const INDUSTRIES = {
  DIEN_TU: "Điện tử",
  DUOC_YTE: "Dược – Y tế",
  THUC_PHAM: "Thực phẩm – Đồ uống",
  BAO_BI_IN: "Bao bì – In",
  CO_KHI: "Cơ khí – Ô tô xe máy",
  DET_MAY: "Dệt may – Da giày",
  HOA_CHAT: "Hoá chất – Mỹ phẩm",
  NONG_NGHIEP: "Nông nghiệp – Chăn nuôi",
  LOGISTICS: "Logistics",
  KHAC: "Khác",
} as const;
export const STAFF_SIZES = { LT50: "Dưới 50 người", "50_200": "50–200 người", "200_1000": "200–1000 người", GT1000: "Trên 1000 người" } as const;
export const OWNERSHIPS = { FDI: "FDI (vốn nước ngoài)", VN: "Doanh nghiệp Việt Nam" } as const;
export const STAGES = {
  PROSPECT: "Tiềm năng",
  QUOTED: "Đã chào giá / gửi mẫu",
  TRIAL: "Mua thử",
  REGULAR: "Mua đều",
  DECLINING: "Giảm mua",
  STOPPED: "Ngừng mua / Mất khách",
} as const;
export const STATUSES = {
  LOST: "Mất khách",
  RISK: "Nguy cơ giảm / ngừng mua",
  SLEEP: "Ngủ (6–12 tháng không mua)",
  NEW: "Khách mới (mua ≤ 90 ngày)",
  ACTIVE: "Mua bình thường",
  INACTIVE: "Không mua 12 tháng",
  NEVER: "Chưa mua",
} as const;

export type IndustryKey = keyof typeof INDUSTRIES;
export type StageKey = keyof typeof STAGES;
export type StatusKey = keyof typeof STATUSES;

/** Tra ngược nhãn -> mã (nhập lại từ Excel: ô chọn ghi nhãn tiếng Việt). Chấp nhận cả mã. */
export function keyOfLabel<T extends Record<string, string>>(map: T, value: unknown): keyof T | null | undefined {
  if (value === null || value === undefined) return undefined;
  const s = String(value).trim();
  if (!s) return null;
  const norm = (x: string) => x.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  for (const [k, label] of Object.entries(map)) if (norm(label) === norm(s) || norm(k) === norm(s)) return k as keyof T;
  return undefined; // giá trị lạ
}

export const profileSchema = z.object({
  address: z.string().trim().max(500).nullable().optional(),
  province: z.string().trim().max(100).nullable().optional(),
  industry: z.enum(Object.keys(INDUSTRIES) as [IndustryKey, ...IndustryKey[]]).nullable().optional(),
  staffSize: z.enum(Object.keys(STAFF_SIZES) as [string, ...string[]]).nullable().optional(),
  ownership: z.enum(Object.keys(OWNERSHIPS) as [string, ...string[]]).nullable().optional(),
  contactPerson: z.string().trim().max(255).nullable().optional(),
  contactPhone: z.string().trim().max(50).nullable().optional(),
  competitors: z.string().trim().max(500).nullable().optional(),
  potentialYear: z.number().min(0).max(1e13).nullable().optional(),
  painPoint: z.string().trim().max(1000).nullable().optional(),
  stage: z.enum(Object.keys(STAGES) as [StageKey, ...StageKey[]]).nullable().optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

export interface ProfileFields {
  address: string | null; // đã gồm địa chỉ tự lấy từ AMIS
  industry: string | null;
  staffSize: string | null;
  ownership: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  stage: string | null; // bước đã XÁC NHẬN (không tính gợi ý)
  potentialYear: number | null;
}
export const PROFILE_CHECKS: { key: string; label: string; ok: (p: ProfileFields) => boolean }[] = [
  { key: "address", label: "Địa chỉ", ok: (p) => !!p.address?.trim() },
  { key: "industry", label: "Ngành nghề", ok: (p) => !!p.industry },
  { key: "staffSize", label: "Quy mô", ok: (p) => !!p.staffSize },
  { key: "ownership", label: "Loại hình", ok: (p) => !!p.ownership },
  { key: "contact", label: "Người liên hệ + SĐT", ok: (p) => !!p.contactPerson?.trim() && !!p.contactPhone?.trim() },
  { key: "stage", label: "Tiến trình (xác nhận)", ok: (p) => !!p.stage },
  { key: "potential", label: "Tiềm năng/năm", ok: (p) => p.potentialYear != null && p.potentialYear > 0 },
];

/** % hồ sơ đầy đủ (0–100) + các mục còn thiếu. */
export function profileCompleteness(p: ProfileFields): { pct: number; missing: string[] } {
  const missing = PROFILE_CHECKS.filter((c) => !c.ok(p)).map((c) => c.label);
  return { pct: Math.round(((PROFILE_CHECKS.length - missing.length) / PROFILE_CHECKS.length) * 100), missing };
}

/** KPI NVKD từ 12/2026: % hồ sơ đầy đủ trung bình của khách hạng A/B. Dưới 90% trừ 2đ, dưới 70% trừ 5đ. */
export const PROFILE_KPI_GOOD = 90;
export const PROFILE_KPI_BAD = 70;
export const profilePenalty = (pct: number | null) => (pct == null ? 0 : pct < PROFILE_KPI_BAD ? 5 : pct < PROFILE_KPI_GOOD ? 2 : 0);
