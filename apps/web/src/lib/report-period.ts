export type ReportType = "week" | "month";

export interface ReportPeriod {
  /** 0 = kỳ đang chọn, 1 = kỳ liền trước, 2 = 2 kỳ trước. */
  index: 0 | 1 | 2;
  label: string;
  start: Date;
  /** Loại trừ (đầu kỳ kế tiếp). */
  end: Date;
}

const pad = (n: number) => String(n).padStart(2, "0");
const dm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;

/** Thứ 2 đầu tuần ISO số `week` của năm `year` (giờ máy chủ = VN, không có DST). */
function isoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dow = jan4.getDay() === 0 ? 7 : jan4.getDay();
  return new Date(year, 0, 4 - (dow - 1) + (week - 1) * 7);
}

/** "2026-W41" của tuần chứa ngày `d` — cùng định dạng ô <input type="week">. */
export function isoWeekString(d: Date): string {
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const year = thursday.getFullYear();
  const week = 1 + Math.round((thursday.getTime() - isoWeekMonday(year, 1).getTime()) / (7 * 86400_000));
  return `${year}-W${pad(week)}`;
}

/**
 * Kỳ báo cáo + 2 kỳ trước nó. Tháng: "YYYY-MM". Tuần ISO (Thứ 2–Chủ nhật, không cắt theo tháng):
 * "YYYY-Www". Trả null nếu định dạng sai.
 */
export function resolveReportPeriods(type: ReportType, period: string): ReportPeriod[] | null {
  const out: ReportPeriod[] = [];
  if (type === "month") {
    const m = /^(\d{4})-(\d{2})$/.exec(period);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    for (const i of [0, 1, 2] as const) {
      const start = new Date(year, month - 1 - i, 1);
      out.push({ index: i, label: `${pad(start.getMonth() + 1)}/${start.getFullYear()}`, start, end: new Date(start.getFullYear(), start.getMonth() + 1, 1) });
    }
    return out;
  }
  const m = /^(\d{4})-W(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > 53) return null;
  const monday = isoWeekMonday(year, week);
  for (const i of [0, 1, 2] as const) {
    const start = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * i);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7);
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
    const wk = isoWeekString(start).slice(-2);
    out.push({ index: i, label: `Tuần ${wk} (${dm(start)}–${dm(last)}/${last.getFullYear()})`, start, end });
  }
  return out;
}

/**
 * Mốc "xem công nợ tại ngày" cho báo cáo: kỳ đã kết thúc -> chốt cuối ngày cuối kỳ; kỳ chưa kết
 * thúc (đang diễn ra / tương lai) -> null = số hiện tại.
 */
export function asOfDateForPeriod(period: ReportPeriod, now: Date): Date | null {
  if (now < period.end) return null;
  return new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() - 1);
}
