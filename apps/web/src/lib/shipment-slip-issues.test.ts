import { describe, expect, it } from "vitest";
import { diagnoseSlipItem, PoLineLite } from "./shipment-slip-issues";

const L = (poCode: string, itemCode: string, itemName: string, poQuantity: number, delivered = 0): PoLineLite => ({ poCode, itemCode, itemName, poQuantity, delivered });
const lines = [L("P1", "ST10014", "Túi xốp", 7500), L("P1", "AA1", "Màng", 10), L("P2", "ST07503", "Ống PE", 50000, 46800), L("P3", "ST07503", "Ống PE", 100, 100)];
const byPo = new Map<string, PoLineLite[]>();
for (const l of lines) byPo.set(l.poCode, [...(byPo.get(l.poCode) ?? []), l]);
const item = (o: Partial<{ itemCode: string | null; itemName: string; poSaleNumber: string | null; qtyActual: number | null }>) => ({
  itemCode: "ST07503",
  itemName: "Ống PE",
  poSaleNumber: "P2",
  qtyActual: 10,
  ...o,
});

describe("diagnoseSlipItem", () => {
  it("khớp PO + mã → không lỗi (cả khi mã có hậu tố .N)", () => {
    expect(diagnoseSlipItem(item({}), byPo, lines)).toBeNull();
    expect(diagnoseSlipItem(item({ poSaleNumber: "P1", itemCode: "AA1.2", itemName: "x" }), byPo, lines)).toBeNull();
  });
  it("thiếu PO → gợi ý PO còn dư SL cùng mã (bỏ PO đã giao đủ)", () => {
    const r = diagnoseSlipItem(item({ poSaleNumber: null }), byPo, lines)!;
    expect(r.kind).toBe("NO_PO");
    expect(r.suggestions.map((s) => s.poCode)).toEqual(["P2"]);
  });
  it("thiếu SL thực xuất", () => {
    expect(diagnoseSlipItem(item({ qtyActual: 0 }), byPo, lines)!.kind).toBe("NO_QTY");
    expect(diagnoseSlipItem(item({ qtyActual: null }), byPo, lines)!.kind).toBe("NO_QTY");
  });
  it("PO chưa có dòng nào", () => {
    expect(diagnoseSlipItem(item({ poSaleNumber: "P9" }), byPo, lines)!.kind).toBe("PO_NOT_FOUND");
  });
  it("mã không có trong PO → gợi ý dòng cùng tên, không có thì các mã của PO", () => {
    const a = diagnoseSlipItem(item({ poSaleNumber: "P1", itemCode: "ST071279", itemName: "Túi  Xốp " }), byPo, lines)!;
    expect(a.kind).toBe("CODE_NOT_IN_PO");
    expect(a.suggestions.map((s) => s.itemCode)).toEqual(["ST10014"]);
    const b = diagnoseSlipItem(item({ poSaleNumber: "P1", itemCode: "ZZ", itemName: "Khác" }), byPo, lines)!;
    expect(b.suggestions.map((s) => s.itemCode)).toEqual(["ST10014", "AA1"]);
  });
});
