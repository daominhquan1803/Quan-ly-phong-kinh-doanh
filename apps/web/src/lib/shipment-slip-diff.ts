/**
 * So sánh 1 Phiếu đi hàng đọc từ file Excel với phiếu cùng Số phiếu ĐÃ CÓ trong hệ thống — dùng khi
 * admin upload phiếu hàng ngày: trùng hệt thì bỏ qua, khác số liệu thì hỏi trước khi ghi đè
 * (anh Quân chốt 21/09/2026). "Số liệu" = ngày phiếu + từng dòng hàng (Số PO + Mã hàng + SL thực
 * xuất); thông tin phụ (địa chỉ, người nhận, ghi chú...) khác nhau không tính là xung đột.
 */

export interface SlipItemForCompare {
  poSaleNumber: string | null;
  itemCode: string | null;
  itemName: string;
  qtyActual: unknown; // number | Prisma.Decimal | null
}

export interface SlipForCompare {
  slipDate: Date | null;
  items: SlipItemForCompare[];
}

const vnDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" });

function dayKey(d: Date | null): string {
  return d ? vnDay.format(d) : "";
}

function dayLabel(d: Date | null): string {
  const k = dayKey(d);
  if (!k) return "(trống)";
  const [y, m, dd] = k.split("-");
  return `${dd}/${m}/${y}`;
}

function itemLabel(i: SlipItemForCompare): string {
  return `${(i.poSaleNumber ?? "").trim() || "?"} / ${(i.itemCode ?? i.itemName).trim()}`;
}

function groupByItem(items: SlipItemForCompare[]): Map<string, { label: string; qty: number }> {
  const map = new Map<string, { label: string; qty: number }>();
  for (const i of items) {
    const key = `${(i.poSaleNumber ?? "").trim().toLowerCase()}|${(i.itemCode ?? i.itemName).trim().toLowerCase()}`;
    const cur = map.get(key) ?? { label: itemLabel(i), qty: 0 };
    cur.qty += Number(i.qtyActual ?? 0);
    map.set(key, cur);
  }
  return map;
}

/** Danh sách khác biệt (tiếng Việt, để hiện cho admin) — mảng rỗng nghĩa là 2 phiếu trùng số liệu. */
export function diffShipmentSlip(existing: SlipForCompare, incoming: SlipForCompare): string[] {
  const diffs: string[] = [];
  if (dayKey(existing.slipDate) !== dayKey(incoming.slipDate)) {
    diffs.push(`Ngày phiếu: ${dayLabel(existing.slipDate)} → ${dayLabel(incoming.slipDate)}`);
  }
  const a = groupByItem(existing.items);
  const b = groupByItem(incoming.items);
  for (const [key, cur] of a) {
    const next = b.get(key);
    if (!next) diffs.push(`Bỏ dòng ${cur.label} (SL ${cur.qty})`);
    else if (Math.abs(cur.qty - next.qty) > 1e-6) diffs.push(`${cur.label}: SL ${cur.qty} → ${next.qty}`);
  }
  for (const [key, next] of b) {
    if (!a.has(key)) diffs.push(`Thêm dòng ${next.label} (SL ${next.qty})`);
  }
  return diffs;
}
