import { stripItemCodeVersionSuffix } from "@hoanggia/db";

/**
 * Chẩn đoán dòng Phiếu đi hàng KHÔNG ghi nhận được vào Tiến độ giao hàng — cùng thứ tự kiểm tra với
 * applyShipmentSlipDeliveries (@hoanggia/db/po-delivery-sync): thiếu Số PO → thiếu SL thực xuất → PO/mã hàng không khớp dòng PO.
 * Trả kèm gợi ý (PO + mã hàng) để Admin bấm sửa ngay ở trang Phiếu đi hàng.
 */
export type SlipIssueKind = "NO_PO" | "NO_QTY" | "PO_NOT_FOUND" | "CODE_NOT_IN_PO";

export interface PoLineLite {
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  poQuantity: number | null;
  delivered: number;
}
export interface SlipItemLite {
  itemCode: string | null;
  itemName: string;
  poSaleNumber: string | null;
  qtyActual: number | null;
}
export interface SlipSuggestion {
  poCode: string;
  itemCode: string;
  label: string;
}
export interface SlipIssue {
  kind: SlipIssueKind;
  reason: string;
  suggestions: SlipSuggestion[];
}

const MAX_SUGGESTIONS = 4;
const sug = (l: PoLineLite): SlipSuggestion => ({
  poCode: l.poCode,
  itemCode: l.itemCode ?? "",
  label: `${l.poCode} / ${l.itemCode} (PO ${l.poQuantity ?? "?"}, đã giao ${l.delivered})`,
});
const hasRoom = (l: PoLineLite) => l.poQuantity == null || l.delivered < l.poQuantity;
const sameCode = (a: string | null, b: string | null) => !!a && !!b && stripItemCodeVersionSuffix(a) === stripItemCodeVersionSuffix(b);

export function diagnoseSlipItem(item: SlipItemLite, linesByPo: Map<string, PoLineLite[]>, allLines: PoLineLite[]): SlipIssue | null {
  if (!item.poSaleNumber) {
    // PO còn dư SL, cùng mã/tên hàng — chỉ gợi ý, Admin chọn PO đúng.
    const sameItem = allLines.filter((l) => l.itemCode && l.poCode && (sameCode(l.itemCode, item.itemCode) || l.itemName === item.itemName) && hasRoom(l));
    return { kind: "NO_PO", reason: "Thiếu Số PO trên phiếu", suggestions: sameItem.slice(0, MAX_SUGGESTIONS).map(sug) };
  }
  if (!item.qtyActual || item.qtyActual <= 0) return { kind: "NO_QTY", reason: "Thiếu SL thực xuất", suggestions: [] };

  const lines = linesByPo.get(item.poSaleNumber) ?? [];
  if (lines.length === 0) return { kind: "PO_NOT_FOUND", reason: `PO ${item.poSaleNumber} chưa có trong Tiến độ giao hàng`, suggestions: [] };
  const matched = lines.some((l) => l.itemCode === item.itemCode || l.itemName === item.itemName || sameCode(l.itemCode, item.itemCode));
  if (matched) return null;

  // Tên hàng gần giống (khác khoảng trắng/hoa thường — khớp chính xác đã loại ở trên) nhưng khác mã → gợi ý đúng dòng đó; không có thì liệt kê các mã đang có trong PO.
  const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  const sameName = lines.filter((l) => l.itemCode && norm(l.itemName) === norm(item.itemName));
  const pick = (sameName.length ? sameName : lines.filter((l) => l.itemCode)).slice(0, MAX_SUGGESTIONS);
  return { kind: "CODE_NOT_IN_PO", reason: `Mã hàng không có trong PO ${item.poSaleNumber}`, suggestions: pick.map(sug) };
}
