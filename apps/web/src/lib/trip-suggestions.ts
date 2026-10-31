import { sameProvince } from "./vn-provinces";
import { normalizeVN } from "./text-normalize";

/** Tập con của CustomerReportRow đủ để gợi ý khách cho chuyến công tác. */
export interface SuggestInput {
  id: string;
  customerCode: string;
  customerName: string;
  address: string | null;
  province: string | null;
  employeeId: string | null;
  employeeName: string;
  orders12: number;
  lastOrderAt: string | null;
  lastTouchAt: string | null;
}

export interface TripSuggestion {
  customerId: string;
  customerCode: string;
  customerName: string;
  address: string | null;
  employeeId: string | null;
  employeeName: string;
  /** null = chưa từng mua / chưa từng liên hệ */
  daysSinceOrder: number | null;
  daysSinceTouch: number | null;
}

const DAY = 86_400_000;
const MAX_SUGGESTIONS = 15;
const ORDER_WINDOW_DAYS = 730; // khách có đơn trong 24 tháng

const daysSince = (iso: string | null, now: Date) => (iso ? Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / DAY)) : null);

/**
 * Khách gợi ý cho 1 chuyến công tác: cùng tỉnh (tỉnh cũ gộp theo sáp nhập 2025), có đơn trong 24 tháng, kể cả khách chưa phân NVKD.
 * Loại khách của chính người đi chính (tự thêm ở form) và khách đã là điểm dừng của chuyến (tên điểm dừng nằm trong tên khách hoặc ngược lại).
 * Xếp chưa liên hệ lâu nhất trước (chưa từng liên hệ đứng đầu), tối đa 15.
 */
export function suggestCustomers(
  rows: SuggestInput[],
  opts: { provinces: string[]; tripEmployeeId: string; excludeNames: string[]; now?: Date }
): TripSuggestion[] {
  if (opts.provinces.length === 0) return [];
  const now = opts.now ?? new Date();
  const stopNames = opts.excludeNames.map(normalizeVN).filter((n) => n.length >= 3);
  const out: TripSuggestion[] = [];
  for (const r of rows) {
    if (!opts.provinces.some((p) => sameProvince(p, r.province))) continue;
    const orderDays = daysSince(r.lastOrderAt, now);
    if (orderDays == null || orderDays > ORDER_WINDOW_DAYS) continue;
    if (r.employeeId && r.employeeId === opts.tripEmployeeId) continue;
    const name = normalizeVN(r.customerName);
    if (stopNames.some((s) => name.includes(s) || s.includes(name))) continue;
    out.push({
      customerId: r.id,
      customerCode: r.customerCode,
      customerName: r.customerName,
      address: r.address,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      daysSinceOrder: orderDays,
      daysSinceTouch: daysSince(r.lastTouchAt, now),
    });
  }
  return out
    .sort((a, b) => (b.daysSinceTouch ?? Infinity) - (a.daysSinceTouch ?? Infinity) || a.customerName.localeCompare(b.customerName, "vi"))
    .slice(0, MAX_SUGGESTIONS);
}
