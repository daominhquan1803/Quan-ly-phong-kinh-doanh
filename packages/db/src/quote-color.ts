/**
 * Suy đoán trạng thái báo giá (QuoteStatus) từ mã màu nền (hex) của dòng trong Google Sheet
 * nguồn — sheet KHÔNG có cột chữ ghi trạng thái tường minh, chỉ có người nhập tô màu tay theo
 * quy ước ngầm hiểu (không thống nhất giữa các tháng — đã kiểm tra thực tế: tháng 6 dùng 5 màu
 * khác nhau, tháng 7 dùng 9 màu, tháng 8 dùng 11 màu, không lặp lại đúng 1 bộ màu cố định).
 *
 * Quy tắc đã thống nhất với anh Quân (chấp nhận rủi ro sai lệch một phần vì không đổi sang nhập
 * chữ tường minh): phân loại theo MÀU GẦN NHẤT trong không gian HSL thay vì khớp đúng mã hex —
 * xanh lá (mọi sắc độ) = Chốt được giá, đỏ/hồng = Không bán được, vàng = Đang thương thảo,
 * trắng/không tô = Chưa báo giá. Cách này bao phủ được nhiều biến thể màu cùng "họ" (vd
 * B6D7A8/70AD47/92D050 đều là các sắc xanh lá khác nhau) nhưng vẫn có thể suy đoán sai với các
 * màu hiếm gặp không rõ họ (vd màu xanh dương/xanh ngọc xuất hiện rải rác, chỉ 1-2 dòng) — những
 * trường hợp này bị ép về màu gần nhất trong 3 màu tham chiếu, độ tin cậy thấp hơn.
 */
import { QuoteStatus } from "@prisma/client";

/** true nếu màu đủ nhạt/không đủ đậm để coi là "không tô" (trắng, xám nhạt...). */
function isNearWhite(h: number, s: number, l: number): boolean {
  return l >= 0.9 || s <= 0.12;
}

/** Chuyển hex "RRGGBB" (không có #) sang HSL — trả về hue theo độ (0-360), saturation/lightness 0-1. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const clean = hex.replace(/^#/, "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return { h, s, l };
}

/** Khoảng cách góc (circular) giữa 2 hue 0-360, luôn trong [0,180]. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

const HUE_RED = 0;
const HUE_YELLOW = 60;
const HUE_GREEN = 120;

/**
 * hex: mã màu nền dòng, dạng "RRGGBB" hoặc null/undefined nếu ô không có màu tô (mặc định trắng
 * — Chưa báo giá).
 *
 * Dùng KHOẢNG hue tường minh (không phải chỉ lấy điểm gần nhất trong 3 điểm tham chiếu 0/60/120)
 * — vì 1 màu xanh lá tươi phổ biến trong bảng màu mặc định của Google Sheets (92D050, hue≈89°)
 * nằm gần NGANG BẰNG khoảng cách tới vàng(60°) và xanh lá(120°), dễ bị xử theo "điểm gần nhất
 * đơn thuần" đẩy nhầm sang vàng — phát hiện được qua test thực tế với đúng màu này, nên nới rộng
 * khoảng xanh lá (70°-170°) thay vì chia đôi đúng giữa 60/120.
 */
export function classifyQuoteStatusByColor(hex: string | null | undefined): QuoteStatus {
  if (!hex) return QuoteStatus.NOT_QUOTED;
  const hsl = hexToHsl(hex);
  if (!hsl) return QuoteStatus.NOT_QUOTED;
  if (isNearWhite(hsl.h, hsl.s, hsl.l)) return QuoteStatus.NOT_QUOTED;

  const h = hsl.h;
  if (h > 20 && h <= 70) return QuoteStatus.NEGOTIATING; // vàng/cam nhạt
  if (h > 70 && h <= 170) return QuoteStatus.WON; // xanh lá, kể cả các sắc ngả vàng hoặc ngả lam
  if (h <= 20 || h > 340) return QuoteStatus.LOST; // đỏ/hồng

  // Màu ngoài 3 họ trên (xanh dương/tím/xanh ngọc...) — hiếm gặp, không rõ ý định của người tô,
  // suy đoán theo màu tham chiếu gần nhất, độ tin cậy thấp hơn (đã lưu sourceColorHex để đối
  // chiếu tay khi cần).
  const distances: [QuoteStatus, number][] = [
    [QuoteStatus.LOST, hueDistance(h, HUE_RED)],
    [QuoteStatus.NEGOTIATING, hueDistance(h, HUE_YELLOW)],
    [QuoteStatus.WON, hueDistance(h, HUE_GREEN)],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][0];
}

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  NOT_QUOTED: "Chưa báo giá",
  NEGOTIATING: "Đang thương thảo",
  WON: "Chốt được giá",
  LOST: "Không bán được",
};
