/**
 * Thống kê "lâu chưa mua" — phần TÍNH THUẦN (không chạm DB) để kiểm thử được.
 * Quy ước anh Quân chốt 15/10/2026: tính theo NGÀY PO (poDate) của dòng theo dõi PO, chỉ từ 01/01/2026 (STATS_FROM), doanh số theo
 * G.Trị PO; "lâu chưa mua" = số THÁNG TRÒN (lịch giờ Việt Nam) từ ngày PO cuối đến ngày chạy báo cáo; 3 mốc không chồng nhau:
 * "2" = từ 2 đến dưới 3 tháng, "3" = từ 3 đến dưới 4 tháng, "over3" = từ 4 tháng trở lên.
 */

export const STATS_FROM = new Date("2026-01-01T00:00:00+07:00");
export const HISTORY_MONTHS = 6;
const VN_MS = 7 * 3600_000;

export type DormantBucket = "2" | "3" | "over3";
export const BUCKET_LABEL: Record<DormantBucket, string> = {
  "2": "Chưa mua từ 2 đến dưới 3 tháng",
  "3": "Chưa mua từ 3 đến dưới 4 tháng",
  over3: "Chưa mua từ 4 tháng trở lên (trên 3 tháng)",
};

export function vnParts(d: Date): { y: number; m: number; d: number } {
  const t = new Date(d.getTime() + VN_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

/** 00:00 giờ VN của ngày (y, m, d) — m ngoài 1..12 được cuộn sang năm khác. */
export function vnMidnight(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d) - VN_MS);
}

/** Số tháng TRÒN từ `from` đến `to` theo lịch VN (vd 15/07 -> 14/09 = 1 tháng, 15/07 -> 15/09 = 2 tháng). */
export function fullMonthsBetween(from: Date, to: Date): number {
  const a = vnParts(from);
  const b = vnParts(to);
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months--;
  return months;
}

/** Lùi n tháng theo lịch VN; ngày vượt số ngày của tháng đích thì lấy ngày cuối tháng (31/08 lùi 6 tháng -> 28/02). */
export function subtractMonths(d: Date, n: number): Date {
  const p = vnParts(d);
  const total = p.y * 12 + (p.m - 1) - n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return vnMidnight(y, m, Math.min(p.d, lastDay));
}

export function bucketOf(months: number): DormantBucket | null {
  if (months === 2) return "2";
  if (months === 3) return "3";
  if (months >= 4) return "over3";
  return null;
}

/** Khóa so khớp mã khách: bỏ tiền tố "X." đầu và dấu chấm cuối (giống lib/debt-customer-match.ts), hoa. */
export function normCode(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.trim().toUpperCase().replace(/^[A-Z]\.(?=.)/, "").replace(/\.+$/, "").trim();
}

export interface PoRow {
  customerCode: string;
  poCode: string;
  poDate: Date;
  itemCode: string | null;
  itemName: string | null;
  unit: string | null;
  qty: number;
  value: number;
  salesEmployeeId: string | null;
}

export interface HistoryLine {
  customerNorm: string;
  customerCode: string;
  poDate: Date;
  poCode: string;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  value: number;
}

export interface DormantCustomer {
  customerNorm: string;
  customerCode: string; // mã ghi trên dòng PO gần nhất
  lastPoDate: Date;
  daysSince: number;
  monthsSince: number;
  /** Người ghi trên dòng PO gần nhất — dự phòng khi khách chưa có NVKD trong danh sách Khách hàng. */
  lastSalesEmployeeId: string | null;
  history: HistoryLine[];
  /** true nếu cửa sổ 6 tháng bị cắt bởi mốc 01/01/2026 (lịch sử không đủ 6 tháng). */
  truncated: boolean;
}

export interface DormantItem extends Omit<DormantCustomer, "history"> {
  itemKey: string;
  itemCode: string;
  itemName: string;
  history: HistoryLine[];
}

const dayDiff = (a: Date, b: Date) => Math.round((vnMidnight(vnParts(b).y, vnParts(b).m, vnParts(b).d).getTime() - vnMidnight(vnParts(a).y, vnParts(a).m, vnParts(a).d).getTime()) / 86400_000);

function toLine(r: PoRow): HistoryLine {
  return {
    customerNorm: normCode(r.customerCode),
    customerCode: r.customerCode,
    poDate: r.poDate,
    poCode: r.poCode,
    itemCode: r.itemCode ?? "",
    itemName: r.itemName ?? "",
    unit: r.unit ?? "",
    qty: r.qty,
    value: r.value,
  };
}

function windowStart(last: Date): { start: Date; truncated: boolean } {
  const s = subtractMonths(last, HISTORY_MONTHS);
  return s < STATS_FROM ? { start: STATS_FROM, truncated: true } : { start: s, truncated: false };
}

/** Khách có PO cuối cùng cách `ref` đúng mốc `bucket`; kèm các dòng PO trong 6 tháng tính lùi từ PO cuối (không sớm hơn 01/01/2026). */
export function buildDormantCustomers(rows: PoRow[], ref: Date, bucket: DormantBucket): DormantCustomer[] {
  const byCustomer = new Map<string, PoRow[]>();
  for (const r of rows) {
    if (r.poDate < STATS_FROM) continue;
    const k = normCode(r.customerCode);
    if (!k) continue;
    byCustomer.set(k, [...(byCustomer.get(k) ?? []), r]);
  }
  const out: DormantCustomer[] = [];
  for (const [norm, list] of byCustomer) {
    const last = list.reduce((a, b) => (b.poDate > a.poDate ? b : a));
    const months = fullMonthsBetween(last.poDate, ref);
    if (bucketOf(months) !== bucket) continue;
    const { start, truncated } = windowStart(last.poDate);
    out.push({
      customerNorm: norm,
      customerCode: last.customerCode,
      lastPoDate: last.poDate,
      daysSince: dayDiff(last.poDate, ref),
      monthsSince: months,
      lastSalesEmployeeId: last.salesEmployeeId,
      history: list
        .filter((r) => r.poDate >= start && r.poDate <= last.poDate)
        .map(toLine)
        .sort((a, b) => b.poDate.getTime() - a.poDate.getTime() || a.poCode.localeCompare(b.poCode)),
      truncated,
    });
  }
  return out.sort((a, b) => a.lastPoDate.getTime() - b.lastPoDate.getTime() || a.customerNorm.localeCompare(b.customerNorm));
}

/** Cặp (khách, mã hàng) có PO cuối cùng của CHÍNH mã hàng đó cách `ref` đúng mốc; lịch sử = các dòng PO của cặp trong 6 tháng tính lùi từ PO cuối của cặp. Dòng không có mã hàng bị bỏ. */
export function buildDormantItems(rows: PoRow[], ref: Date, bucket: DormantBucket): DormantItem[] {
  const byPair = new Map<string, PoRow[]>();
  for (const r of rows) {
    if (r.poDate < STATS_FROM) continue;
    const c = normCode(r.customerCode);
    const i = (r.itemCode ?? "").trim().toUpperCase();
    if (!c || !i) continue;
    const k = `${c}||${i}`;
    byPair.set(k, [...(byPair.get(k) ?? []), r]);
  }
  const out: DormantItem[] = [];
  for (const [key, list] of byPair) {
    const last = list.reduce((a, b) => (b.poDate > a.poDate ? b : a));
    const months = fullMonthsBetween(last.poDate, ref);
    if (bucketOf(months) !== bucket) continue;
    const { start, truncated } = windowStart(last.poDate);
    out.push({
      itemKey: key,
      customerNorm: normCode(last.customerCode),
      customerCode: last.customerCode,
      itemCode: (last.itemCode ?? "").trim(),
      itemName: last.itemName ?? "",
      lastPoDate: last.poDate,
      daysSince: dayDiff(last.poDate, ref),
      monthsSince: months,
      lastSalesEmployeeId: last.salesEmployeeId,
      history: list
        .filter((r) => r.poDate >= start && r.poDate <= last.poDate)
        .map(toLine)
        .sort((a, b) => b.poDate.getTime() - a.poDate.getTime() || a.poCode.localeCompare(b.poCode)),
      truncated,
    });
  }
  return out.sort(
    (a, b) =>
      a.customerNorm.localeCompare(b.customerNorm) || a.lastPoDate.getTime() - b.lastPoDate.getTime() || a.itemCode.localeCompare(b.itemCode)
  );
}

export type InvoicePayStatus = "PAID" | "PARTIAL" | "UNPAID";
export const PAY_STATUS_LABEL: Record<InvoicePayStatus, string> = {
  PAID: "Đã thanh toán",
  PARTIAL: "Thanh toán một phần",
  UNPAID: "Chưa thanh toán",
};

export function payStatus(original: number, paid: number): InvoicePayStatus {
  if (paid >= original - 0.5) return "PAID";
  if (paid > 0.5) return "PARTIAL";
  return "UNPAID";
}
