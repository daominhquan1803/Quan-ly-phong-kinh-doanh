import { z } from "zod";

/**
 * Báo cáo công tác: buổi đi chỉ tính điểm (Kế hoạch tuần + KPI tháng) khi báo cáo được duyệt (status APPROVED),
 * và chỉ tính KHÁCH đã gặp. Stop cũ (đăng ký trước đợt đổi luồng) không có outcome -> vẫn tính như trước.
 */
export const COUNTED_STOP_WHERE = { attendeeId: null, OR: [{ outcome: null }, { outcome: "MET" as const }] };
/**
 * Điểm dừng mới (có người đi gặp riêng, anh Quân chốt 31/10/2026): chỉ tính khi chính điểm dừng đó có báo cáo "gặp được" (khác điểm
 * dừng cũ vốn tính cả khi chưa có kết quả). Ai được điểm xem lib/trip-credit.ts. COUNTED_STOP_WHERE ở trên chỉ còn là điểm dừng cũ.
 */
export const COUNTED_NEW_STOP_WHERE = { attendeeId: { not: null }, outcome: "MET" as const };
/** Điểm dừng được tính, cả cũ lẫn mới — cho chỗ chỉ cần biết khách đã được gặp (không xét ai được điểm). */
export const COUNTED_ANY_STOP_WHERE = { OR: [COUNTED_STOP_WHERE, COUNTED_NEW_STOP_WHERE] };
/** Buổi đi tính điểm = đã duyệt VÀ có ít nhất 1 khách tính điểm. */
export const COUNTED_TRIP_WHERE = { status: "APPROVED" as const, stops: { some: COUNTED_STOP_WHERE } };

export const MIN_MET_CONTENT = 30;
export const MIN_OTHER_CONTENT = 10;
export const MAX_PHOTOS_PER_STOP = 5;
export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const TRIP_STATUS_LABEL = {
  PENDING: "Chờ báo cáo",
  REPORTED: "Chờ duyệt",
  NEEDS_REVISION: "Cần bổ sung",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
} as const;
export const OUTCOME_LABEL = { MET: "Đã gặp", NOT_MET: "Không gặp được", RESCHEDULED: "Hẹn gặp lại" } as const;

const phoneOk = (s: string) => {
  const digits = s.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 && /^[\d\s+().-]+$/.test(s);
};

export const checkinSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().min(0).max(100000),
});

export const reportStopSchema = z.object({
  stopId: z.string().trim().min(1),
  outcome: z.enum(["MET", "NOT_MET", "RESCHEDULED"]),
  contactName: z.string().trim().max(200).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  reportContent: z.string().trim().max(4000).optional().nullable(),
  productInterest: z.string().trim().max(1000).optional().nullable(),
  nextAction: z.string().trim().max(1000).optional().nullable(),
  nextActionDue: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  nextActionOwnerId: z.string().trim().min(1).optional().nullable(),
  checkin: checkinSchema.optional().nullable(),
});
export type ReportStopInput = z.infer<typeof reportStopSchema>;

export const reportSchema = z.object({
  stops: z.array(reportStopSchema).min(1, "Thiếu báo cáo từng khách").max(20),
});

/**
 * Kiểm tra từng khách trong báo cáo. `photoCountByStop` = số ảnh đã tải lên cho khách đó. `requireProof` = bắt
 * buộc có ảnh hoặc định vị với khách "Đã gặp" (Quản trị viên nhập hộ thì không bắt buộc). Trả danh sách lỗi (rỗng = hợp lệ).
 */
export function validateReportStops(
  stops: ReportStopInput[],
  photoCountByStop: Map<string, number>,
  requireProof: boolean
): string[] {
  const errors: string[] = [];
  stops.forEach((s, i) => {
    const label = `Khách ${i + 1}`;
    const content = (s.reportContent ?? "").trim();
    if (s.outcome === "NOT_MET" || s.outcome === "RESCHEDULED") {
      if (content.length < MIN_OTHER_CONTENT) errors.push(`${label}: ghi lý do (tối thiểu ${MIN_OTHER_CONTENT} ký tự)`);
    }
    if (s.outcome === "MET") {
      if (!(s.contactName ?? "").trim()) errors.push(`${label}: thiếu tên người đã gặp`);
      if (!phoneOk((s.contactPhone ?? "").trim())) errors.push(`${label}: thiếu hoặc sai số điện thoại người đã gặp`);
      if (content.length < MIN_MET_CONTENT) {
        errors.push(`${label}: nội dung đã trao đổi quá ngắn (tối thiểu ${MIN_MET_CONTENT} ký tự)`);
      }
      if (requireProof && !s.checkin && (photoCountByStop.get(s.stopId) ?? 0) === 0) {
        errors.push(`${label}: cần ít nhất 1 ảnh hoặc định vị check-in`);
      }
    }
    if (s.outcome === "MET" || s.outcome === "RESCHEDULED") {
      if (!(s.nextAction ?? "").trim()) errors.push(`${label}: thiếu bước tiếp theo`);
      if (!s.nextActionDue) errors.push(`${label}: thiếu hạn của bước tiếp theo`);
    }
  });
  return errors;
}

/** Cảnh báo cho người duyệt từ dữ liệu check-in (không chặn, chỉ báo). visitDate = ngày đi của buổi. */
export function checkinWarnings(
  c: { lat: number; lng: number; accuracyM: number | null; at: Date | string | null },
  visitDate: Date | string
): string[] {
  const w: string[] = [];
  if (c.accuracyM != null && c.accuracyM > 300) w.push(`Độ chính xác thấp (±${Math.round(c.accuracyM)}m)`);
  if (c.lat < 8 || c.lat > 24 || c.lng < 102 || c.lng > 110) w.push("Vị trí nằm ngoài Việt Nam");
  if (c.at) {
    const day = (d: Date | string) => new Date(new Date(d).getTime() + 7 * 3600_000).toISOString().slice(0, 10);
    if (day(c.at) !== day(visitDate)) w.push("Check-in khác ngày đi đã đăng ký");
  }
  return w;
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/** Nhận diện đúng định dạng ảnh theo vài byte đầu (không tin mime do client gửi). */
export function sniffImageMime(buf: Uint8Array): (typeof PHOTO_MIME_TYPES)[number] | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  const ascii = (a: number, b: number) => String.fromCharCode(...Array.from(buf.slice(a, b)));
  if (buf.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
