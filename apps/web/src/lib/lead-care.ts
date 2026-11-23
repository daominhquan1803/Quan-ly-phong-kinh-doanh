/**
 * Khách đủ 10 mục trên Google Sheet khách tiềm năng -> hồ sơ khách hàng + lịch sử chăm sóc + nhắc hẹn (anh Quân chốt 23/11/2026).
 * File này chỉ chứa phần thuần (ghép tên, ánh xạ kênh/kết quả, mã tạm, ghi chú); phần ghi DB ở lead-scan-data.ts (syncCustomers).
 */
import { normalizeVN } from "./text-normalize";
import type { EntryCandidate } from "./lead-scan";

export type CareChannelKey = "CALL" | "ZALO" | "MEET";
export type CareOutcomeKey = "NORMAL" | "NEW_NEED" | "NO_CONTACT" | "LOST";

/** Từ chỉ loại hình công ty — bỏ đi để "Công ty TNHH ABC Việt Nam" và "ABC" ra cùng 1 khoá. Chỉ so sánh BẰNG nhau (không so gần đúng) cho an toàn. */
const LEGAL_WORDS = /\b(cong ty|tnhh|co phan|cp|mtv|tm|dv|jsc|ltd|co|company|limited|corporation|corp|inc)\b/g;

/** Khoá ghép tên công ty: bỏ dấu, bỏ từ loại hình, bỏ ký tự lạ, gộp khoảng trắng. Rỗng nếu tên chỉ gồm từ loại hình. */
export function companyKey(name: string | null | undefined): string {
  return normalizeVN(name ?? "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(LEGAL_WORDS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Điện thoại / gọi -> CALL; gặp trực tiếp -> MEET; còn lại (Zalo, Messenger, Email, Facebook, LinkedIn, trống) -> ZALO (nhắn tin). */
export function mapChannel(channel: string | null | undefined): CareChannelKey {
  const t = normalizeVN(channel ?? "");
  if (/gap|truc tiep|meet|den (cong ty|nha may)/.test(t)) return "MEET";
  if (/dien thoai|goi|call|hotline|sdt/.test(t)) return "CALL";
  return "ZALO";
}

/** Kết quả chữ tự do -> kết quả chăm sóc của app. Thứ tự: mất khách > không liên lạc được > cơ hội bán > bình thường. */
export function mapOutcome(result: string | null | undefined, kind: string | null | undefined): CareOutcomeKey {
  const t = normalizeVN(result ?? "");
  if (/da co ncc|tu choi|loai|khong phu hop|chuyen (sang )?ncc|da chon ncc/.test(t)) return "LOST";
  if (kind === "NO_RESPONSE") return "NO_CONTACT";
  if (/bao gia|gui mau|dam phan|co don|da mua|dat hang/.test(t)) return "NEW_NEED";
  return "NORMAL";
}

export const ownershipOf = (nationality: string): "VN" | "FDI" => (normalizeVN(nationality).startsWith("viet") ? "VN" : "FDI");

/** Nửa đêm giờ Việt Nam của ngày YYYY-MM-DD (app lưu hẹn chăm sóc là mốc thời gian, so với "bây giờ"). */
export const vnMidnight = (iso: string) => new Date(`${iso}T00:00:00+07:00`);

/** Giờ ghi của lần chăm sóc lấy từ sheet: 12:00 trưa ngày liên hệ, không vượt quá lúc đồng bộ (tránh log "ở tương lai"). */
export function careCreatedAt(contactIso: string, now: Date): Date {
  const t = new Date(`${contactIso}T12:00:00+07:00`);
  return t.getTime() > now.getTime() ? now : t;
}

/** Nội dung ghi chú của lần chăm sóc — đủ để người xem lịch sử hiểu mà không cần mở sheet. */
export function careNote(c: Pick<EntryCandidate, "result" | "workDone" | "need" | "nextAction" | "nextActionAt">): string {
  const parts = [
    c.result ? `Kết quả: ${c.result}` : null,
    `Việc đã làm: ${c.workDone}`,
    `Nhu cầu: ${c.need}`,
    `Hành động tiếp theo: ${c.nextAction} (hẹn ${c.nextActionAt.split("-").reverse().join("/")})`,
    "(ghi từ Google Sheet khách tiềm năng)",
  ];
  return parts.filter(Boolean).join("\n");
}

/** Mã tạm "KHM-XXXXXX" cho khách chưa có mã AMIS: băm khoá dòng sheet (ổn định giữa các lần đồng bộ); trùng thì thêm số. */
export function leadCustomerCode(sheetKey: string, taken: Set<string>): string {
  let h = 2166136261;
  for (let i = 0; i < sheetKey.length; i++) h = Math.imul(h ^ sheetKey.charCodeAt(i), 16777619) >>> 0;
  const base = `KHM-${h.toString(36).toUpperCase().padStart(6, "0").slice(-6)}`;
  let code = base;
  for (let n = 2; taken.has(code); n++) code = `${base}-${n}`;
  return code;
}
