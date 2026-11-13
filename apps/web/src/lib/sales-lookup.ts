import { normCode, vnParts } from "./stats";

// Tra cứu doanh số theo tháng của khách hàng / mã hàng (trang Báo cáo > Doanh số khách / mã hàng).
//  - Doanh số đơn hàng = G.Trị PO của dòng PO theo NGÀY PO (PoTrackingLine.poValue).
//  - Doanh số đi hàng  = giá trị các đợt giao (PoDeliveryEvent.value) theo NGÀY GIAO: đợt từ file theo dõi PO nhiều năm + đợt tự sinh từ Phiếu đi hàng.
// Mã hàng gộp theo mã hàng (không có mã thì theo tên SP), không phân biệt khách.

export type LookupBy = "customer" | "item";
export type LookupMetric = "order" | "delivered";

export interface LookupLine {
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

export interface LookupDelivery {
  customerCode: string;
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  unit: string | null;
  eventDate: Date;
  qty: number;
  value: number;
  fromSlip: boolean;
  salesEmployeeId: string | null;
}

export interface LookupMeta {
  code: string;
  name: string;
  ownerId: string | null;
  ownerName: string;
}

export interface LookupRow {
  key: string;
  code: string;
  name: string;
  ownerName: string;
  orders: number[];
  delivered: number[];
  ordersTotal: number;
  deliveredTotal: number;
}

export interface LookupDetailRow {
  date: Date;
  poCode: string;
  customerCode: string;
  customerName: string;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: number;
  value: number;
  source: string;
}

/** "2026-01".."2026-04" -> ["2026-01","2026-02","2026-03","2026-04"] (rỗng nếu from > to). */
export function monthKeys(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

export function monthKeyOf(d: Date): string {
  const p = vnParts(d);
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

/** Khoá gộp mã hàng: mã hàng, không có thì tên SP (chuẩn hoá hoa/khoảng trắng). */
export function itemKey(itemCode: string | null, itemName: string | null): string {
  return ((itemCode ?? "").trim() || (itemName ?? "").trim()).replace(/\s+/g, " ").toUpperCase();
}

const customerKeyOf = (code: string) => normCode(code);

/**
 * Thuần: gộp doanh số theo khách (hoặc mã hàng) × tháng. `metaOf` trả tên/NVKD của khách (theo danh sách Khách hàng, không có thì mã);
 * `ownerFilterId` (NVKD xem hoặc ADMIN lọc) giữ lại các dòng thuộc khách của NVKD đó. Sắp theo doanh số đơn hàng giảm dần.
 */
export function aggregateLookup(
  by: LookupBy,
  months: string[],
  lines: LookupLine[],
  deliveries: LookupDelivery[],
  metaOf: (customerCode: string, lastOwnerId: string | null) => LookupMeta,
  ownerFilterId: string | null
): LookupRow[] {
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = new Map<string, LookupRow>();
  const owners = new Map<string, Set<string>>(); // tên NVKD các khách trong dòng (chế độ mã hàng)

  const touch = (customerCode: string, itemCode: string | null, itemName: string | null, lastOwnerId: string | null) => {
    const meta = metaOf(customerCode, lastOwnerId);
    if (ownerFilterId && meta.ownerId !== ownerFilterId) return null;
    const key = by === "customer" ? customerKeyOf(customerCode) : itemKey(itemCode, itemName);
    if (!key) return null;
    let row = rows.get(key);
    if (!row) {
      const blank = { orders: months.map(() => 0), delivered: months.map(() => 0), ordersTotal: 0, deliveredTotal: 0 };
      row =
        by === "customer"
          ? { key, code: meta.code, name: meta.name, ownerName: meta.ownerName, ...blank }
          : { key, code: (itemCode ?? "").trim(), name: (itemName ?? "").trim(), ownerName: "", ...blank };
      rows.set(key, row);
    }
    if (by === "item" && meta.ownerName) {
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key)!.add(meta.ownerName);
    }
    return row;
  };

  for (const l of lines) {
    const i = idx.get(monthKeyOf(l.poDate));
    if (i === undefined) continue;
    const row = touch(l.customerCode, l.itemCode, l.itemName, l.salesEmployeeId);
    if (!row) continue;
    row.orders[i] += l.value;
    row.ordersTotal += l.value;
  }
  for (const e of deliveries) {
    const i = idx.get(monthKeyOf(e.eventDate));
    if (i === undefined) continue;
    const row = touch(e.customerCode, e.itemCode, e.itemName, e.salesEmployeeId);
    if (!row) continue;
    row.delivered[i] += e.value;
    row.deliveredTotal += e.value;
  }
  if (by === "item") for (const [key, set] of owners) rows.get(key)!.ownerName = Array.from(set).sort((a, b) => a.localeCompare(b, "vi")).join(", ");

  return Array.from(rows.values()).sort((a, b) => b.ordersTotal - a.ordersTotal || b.deliveredTotal - a.deliveredTotal || a.name.localeCompare(b.name));
}

/** Thuần: các dòng PO / đợt giao tạo nên 1 ô (khách hoặc mã hàng × tháng) của bảng, để bấm vào xem chi tiết. */
export function selectDetail(
  by: LookupBy,
  key: string,
  month: string,
  metric: LookupMetric,
  lines: LookupLine[],
  deliveries: LookupDelivery[],
  metaOf: (customerCode: string, lastOwnerId: string | null) => LookupMeta,
  ownerFilterId: string | null
): LookupDetailRow[] {
  const matches = (customerCode: string, itemCode: string | null, itemName: string | null, d: Date, lastOwnerId: string | null) => {
    if (monthKeyOf(d) !== month) return null;
    const meta = metaOf(customerCode, lastOwnerId);
    if (ownerFilterId && meta.ownerId !== ownerFilterId) return null;
    const k = by === "customer" ? customerKeyOf(customerCode) : itemKey(itemCode, itemName);
    return k === key ? meta : null;
  };
  const out: LookupDetailRow[] = [];
  if (metric === "order") {
    for (const l of lines) {
      const meta = matches(l.customerCode, l.itemCode, l.itemName, l.poDate, l.salesEmployeeId);
      if (!meta) continue;
      out.push({ date: l.poDate, poCode: l.poCode, customerCode: meta.code, customerName: meta.name, itemCode: l.itemCode ?? "", itemName: l.itemName ?? "", unit: l.unit ?? "", qty: l.qty, value: l.value, source: "PO" });
    }
  } else {
    for (const e of deliveries) {
      const meta = matches(e.customerCode, e.itemCode, e.itemName, e.eventDate, e.salesEmployeeId);
      if (!meta) continue;
      out.push({ date: e.eventDate, poCode: e.poCode, customerCode: meta.code, customerName: meta.name, itemCode: e.itemCode ?? "", itemName: e.itemName ?? "", unit: e.unit ?? "", qty: e.qty, value: e.value, source: e.fromSlip ? "Phiếu đi hàng" : "File theo dõi PO" });
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime() || a.poCode.localeCompare(b.poCode));
}
