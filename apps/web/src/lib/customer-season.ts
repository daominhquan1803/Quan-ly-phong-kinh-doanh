/**
 * Khách mua theo vụ (vd EMIC mua tháng 6): không chấm theo nhịp đặt hàng thường (giữa hai vụ im lặng là bình thường),
 * mà nhắc NVKD TRƯỚC vụ `leadMonths` tháng (mặc định 2: vụ tháng 6 nhắc từ 01/04):
 *  - REMIND   : tới ngày nhắc, chưa có đơn/chưa chăm sóc  -> nhắc NVKD
 *  - ESCALATE : sau 1 tháng vẫn chưa có ghi chăm sóc nào   -> nhắc NVKD + báo Trưởng phòng
 *  - MISSED   : hết tháng vụ mà chưa có đơn                -> cảnh báo đỏ (trong 30 ngày sau khi hết vụ)
 *  - null     : chưa tới lúc, đã có đơn trong vụ, hoặc NVKD đã chăm sóc (đang xử lý)
 * Hàm thuần (nhận `now`), test được. Tháng tính theo giờ Việt Nam do tầng gọi truyền vào.
 */

export type SeasonStage = "REMIND" | "ESCALATE" | "MISSED";

export interface SeasonCheckInput {
  seasonMonths: number[];
  leadMonths: number;
  /** Ngày hiện tại theo giờ VN, dạng {year, month(1-12), day}. */
  today: { year: number; month: number; day: number };
  /** Ngày các đơn của khách (đã bỏ đơn huỷ), dạng timestamp ms. */
  orderDates: number[];
  /** Thời điểm các lần ghi chăm sóc (trừ NO_CONTACT), timestamp ms. */
  careDates: number[];
}

export interface SeasonCheckResult {
  stage: SeasonStage;
  /** Tháng vào vụ, dạng "YYYY-MM" (để làm khoá chống nhắc trùng). */
  season: string;
  seasonMonth: number;
  /** Số ngày tới đầu tháng vụ (âm = đã vào/qua vụ). */
  daysToSeason: number;
}

const DAY_MS = 86_400_000;
const utc = (y: number, m: number, d = 1) => Date.UTC(y, m - 1, d);

/** Dời (year, month) đi `delta` tháng. */
function shiftMonth(y: number, m: number, delta: number): { y: number; m: number } {
  const idx = y * 12 + (m - 1) + delta;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
}

export function checkSeason(input: SeasonCheckInput): SeasonCheckResult | null {
  const { seasonMonths, leadMonths, today, orderDates, careDates } = input;
  const lead = Math.min(Math.max(leadMonths, 1), 6);
  const todayMs = utc(today.year, today.month, today.day);

  // Xét các vụ trong năm trước/nay/sau, chọn vụ mà hôm nay nằm trong [ngày nhắc, hết tháng vụ + 30 ngày].
  for (const month of [...seasonMonths].sort((a, b) => a - b)) {
    for (const year of [today.year - 1, today.year, today.year + 1]) {
      const start = utc(year, month);
      const next = shiftMonth(year, month, 1);
      const end = utc(next.y, next.m); // đầu tháng sau = hết tháng vụ
      const r = shiftMonth(year, month, -lead);
      const remindAt = utc(r.y, r.m);
      if (todayMs < remindAt || todayMs >= end + 30 * DAY_MS) continue;

      // Có đơn kể từ ngày nhắc tới hết tháng vụ -> coi như đã mua vụ này.
      if (orderDates.some((t) => t >= remindAt && t < end + 30 * DAY_MS)) return null;

      const season = `${year}-${String(month).padStart(2, "0")}`;
      const daysToSeason = Math.round((start - todayMs) / DAY_MS);
      if (todayMs >= end) return { stage: "MISSED", season, seasonMonth: month, daysToSeason };

      const cared = careDates.some((t) => t >= remindAt);
      if (cared) return null;
      const e = shiftMonth(r.y, r.m, 1);
      const escalateAt = utc(e.y, e.m);
      return {
        stage: todayMs >= escalateAt ? "ESCALATE" : "REMIND",
        season,
        seasonMonth: month,
        daysToSeason,
      };
    }
  }
  return null;
}

/** Gợi ý khách "có thể mua theo vụ": ≤ 2 lần đặt/năm và các lần đặt cùng tháng ở ít nhất 2 năm khác nhau. */
export function suggestSeasonMonths(orderDates: number[]): number[] {
  if (orderDates.length < 2) return [];
  const byMonth = new Map<number, Set<number>>();
  const years = new Set<number>();
  for (const t of orderDates) {
    const d = new Date(t + 7 * 3600_000);
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    years.add(y);
    if (!byMonth.has(m)) byMonth.set(m, new Set());
    byMonth.get(m)!.add(y);
  }
  const perYear = orderDates.length / Math.max(1, years.size);
  if (perYear > 2) return [];
  return Array.from(byMonth.entries())
    .filter(([, ys]) => ys.size >= 2)
    .map(([m]) => m)
    .sort((a, b) => a - b);
}

export const SEASON_STAGE_LABEL: Record<SeasonStage, string> = {
  REMIND: "Sắp vào vụ",
  ESCALATE: "Sắp vào vụ, chưa liên hệ",
  MISSED: "Lỡ vụ",
};
