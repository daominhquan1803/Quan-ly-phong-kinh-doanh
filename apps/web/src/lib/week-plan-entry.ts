/**
 * Dòng "khách hàng liên hệ mới / hẹn gặp mới" của Kế hoạch tuần phải ĐỦ thông tin mới được tính (anh Quân chốt
 * 24/10/2026): công ty, địa chỉ, quốc tịch, quy mô, người liên hệ + SĐT, nhu cầu, việc đã làm, hành động tiếp theo
 * kèm ngày hẹn nhắc. Dòng ghi trước 26/10/2026 giữ nguyên và vẫn tính, để điểm tuần/KPI đã chốt không đổi.
 */
import { z } from "zod";
import { STAFF_SIZES } from "./customer-profile";
import { normalizeVN } from "./text-normalize";

export const WEEK_ENTRY_COMPLETE_FROM = new Date("2026-10-26T00:00:00+07:00");

/**
 * Tuần 19–25/10/2026: anh Quân thấy anh Tùng nhập toàn khách cũ nên cho tính lại RIÊNG dòng của anh Tùng theo luật "chỉ tính khách mới".
 * ponytail: nhận diện theo tên (chỉ 1 người, 1 tuần); đổi sang cờ trong DB nếu cần áp cho nhiều người.
 */
export const RETRO_EXISTING_CHECK = { from: new Date("2026-10-19T00:00:00+07:00"), employeeName: "ngo thanh tung" };

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

/** Cột của file Excel nhập "KẾT QUẢ" (theo đúng thứ tự trong file mẫu): tiêu đề mẫu + cách nhận diện cột khi nhập. */
export const IMPORT_COLUMNS = {
  metric: { header: "Mục", re: /mục/i, width: 28 },
  date: { header: "Ngày tháng", re: /ngày/i, exclude: /hẹn|nhắc/i, width: 13 },
  customer: { header: "Khách hàng (tên công ty)", re: /khách/i, width: 32 },
  address: { header: "Địa chỉ", re: /địa chỉ/i, width: 34 },
  nationality: { header: "Quốc tịch", re: /quốc tịch/i, width: 13 },
  scale: { header: "Quy mô", re: /quy mô/i, width: 18 },
  contactName: { header: "Người liên hệ", re: /người liên hệ/i, width: 22 },
  contactPhone: { header: "Số điện thoại", re: /điện thoại|sđt|sdt/i, width: 16 },
  need: { header: "Nhu cầu", re: /nhu cầu/i, width: 34 },
  workDone: { header: "Việc đã làm", re: /việc đã làm/i, width: 34 },
  nextAction: { header: "Hành động tiếp theo", re: /hành động/i, width: 30 },
  nextActionAt: { header: "Ngày hẹn nhắc", re: /hẹn nhắc|ngày hẹn/i, width: 14 },
  productInterest: { header: "Sản phẩm quan tâm", re: /sản phẩm/i, width: 24 },
  content: { header: "Nội dung / Ghi chú", re: /nội dung/i, width: 28 },
  contactInfo: { header: "Thông tin liên hệ (file cũ)", re: /thông tin liên hệ/i, width: 24 },
} as const;

type ColumnSpec = { re: RegExp; exclude?: RegExp };

/** Vị trí từng cột (−1 nếu không có) theo hàng tiêu đề. */
export function mapImportColumns(headers: string[]): Record<keyof typeof IMPORT_COLUMNS, number> {
  const out = {} as Record<keyof typeof IMPORT_COLUMNS, number>;
  for (const key of Object.keys(IMPORT_COLUMNS) as (keyof typeof IMPORT_COLUMNS)[]) {
    const spec: ColumnSpec = IMPORT_COLUMNS[key];
    out[key] = headers.findIndex((h) => spec.re.test(h) && !(spec.exclude && spec.exclude.test(h)));
  }
  return out;
}

export const METRIC_IMPORT_LABEL = { NEW_CONTACT: "Khách hàng mới liên hệ", NEW_MEETING: "Khách hàng mới hẹn gặp được" } as const;

export type EntryStatus = "COUNTED" | "INCOMPLETE" | "DUPLICATE" | "EXISTING" | "NO_TRIP";

/**
 * "KH mới hẹn gặp được" chỉ tính khi NVKD đã đi gặp khách (anh Quân chốt 31/10/2026): có điểm dừng của đăng ký công tác ĐÃ DUYỆT
 * (đã nộp báo cáo, gặp được khách — cùng định nghĩa buổi đi tính điểm ở business-trip-report.ts) của chính NVKD, tên công ty điểm dừng nằm trong
 * tên khách của dòng (cùng cách khớp với mục khách cũ), ngày đi từ ngày ghi nhận trở đi. Áp cho dòng ghi từ 26/10/2026.
 */
export interface TripStopLite {
  employeeId: string;
  visitDate: Date;
  companyName: string;
}
const HALF_DAY = 12 * 3600_000; // ngày đi / ngày ghi có thể lưu lệch múi giờ — cho lệch nửa ngày
export function hasCountedTrip(e: { employeeId: string; customerName: string; entryDate: Date }, stops: TripStopLite[]): boolean {
  const name = normalizeVN(e.customerName);
  return stops.some((s) => {
    const company = normalizeVN(s.companyName);
    return s.employeeId === e.employeeId && s.visitDate.getTime() >= e.entryDate.getTime() - HALF_DAY && company.length >= 3 && name.includes(company);
  });
}

export interface ClassifiableEntry extends EntryFields {
  id: string;
  employeeId: string;
  metric: string;
  weekStart: Date;
  createdAt: Date;
  /** Chỉ mục NEW_MEETING: có đăng ký công tác đã duyệt khớp không (hasCountedTrip). undefined = không xét. */
  tripOk?: boolean;
  /** Đơn/hoá đơn gần nhất của khách (khớp theo tên) TRƯỚC tuần của dòng — để loại khách cũ. */
  lastOrderDate?: Date | null;
  lastOrderCustomer?: string | null;
  /** Áp luật "chỉ tính khách mới" cho cả dòng trước 26/10/2026 (tính lại riêng tuần 19–25/10 của anh Tùng theo lệnh anh Quân 26/10). */
  checkExisting?: boolean;
}

/**
 * Phân loại các dòng nhập tay (anh Quân chốt 26/10/2026): mỗi khách chỉ tính 1 lần cho mỗi mục trong 1 THÁNG, cho NVKD GHI TRƯỚC
 * (theo ngày ghi nhận, bằng ngày thì theo giờ nhập) — ghi nhiều lần, tuần sau ghi lại, hoặc NVKD khác ghi lại cùng khách đều không tính thêm. Dòng đầu tiên ĐƯỢC TÍNH (đủ
 * thông tin) giữ chỗ; dòng thiếu thông tin không giữ chỗ nên không chặn dòng đủ thông tin ghi sau. Dòng trước 26/10/2026 luôn
 * được tính như cũ (không bị coi là trùng) nhưng vẫn giữ chỗ để dòng mới sau đó bị coi là trùng. `entries` phải gồm cả các tuần
 * trước trong cùng tháng.
 */
export interface EntryClass {
  status: EntryStatus;
  /** Với DUPLICATE: ngày và NVKD đã ghi khách này trước (được tính). */
  firstDate?: Date;
  firstEmployeeId?: string;
  /** Với EXISTING: đơn gần nhất của khách cũ này. */
  lastOrderDate?: Date;
  lastOrderCustomer?: string | null;
}

export function classifyEntries(entries: ClassifiableEntry[]): Map<string, EntryClass> {
  const sorted = [...entries].sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
  const first = new Map<string, { date: Date; employeeId: string }>();
  const out = new Map<string, EntryClass>();
  for (const e of sorted) {
    if (!entryCounts(e)) {
      out.set(e.id, { status: "INCOMPLETE" });
      continue;
    }
    // "Khách mới" = chưa từng mua hàng của công ty, hoặc không mua từ 1 năm trở lên (tính từ đầu tuần). Khách đang mua thì không tính
    // và không giữ chỗ — dòng cũ trước mốc 26/10/2026 vẫn không bị xét (đã loại ở entryCounts).
    if ((e.entryDate >= WEEK_ENTRY_COMPLETE_FROM || e.checkExisting) && e.lastOrderDate) {
      const yearAgo = new Date(e.weekStart);
      yearAgo.setFullYear(yearAgo.getFullYear() - 1);
      if (e.lastOrderDate > yearAgo) {
        out.set(e.id, { status: "EXISTING", lastOrderDate: e.lastOrderDate, lastOrderCustomer: e.lastOrderCustomer ?? null });
        continue;
      }
    }
    // Chưa có đăng ký công tác đã duyệt thì chưa tính và không giữ chỗ (khi có đăng ký được duyệt, dòng tự được tính).
    if (e.metric === "NEW_MEETING" && e.entryDate >= WEEK_ENTRY_COMPLETE_FROM && e.tripOk === false) {
      out.set(e.id, { status: "NO_TRIP" });
      continue;
    }
    const key = `${e.metric}|${e.weekStart.getFullYear()}-${e.weekStart.getMonth()}|${normalizeVN(e.customerName)}`;
    const seen = first.get(key);
    if (seen && e.entryDate >= WEEK_ENTRY_COMPLETE_FROM) {
      out.set(e.id, { status: "DUPLICATE", firstDate: seen.date, firstEmployeeId: seen.employeeId });
      continue;
    }
    if (!seen) first.set(key, { date: e.entryDate, employeeId: e.employeeId });
    out.set(e.id, { status: "COUNTED" });
  }
  return out;
}
