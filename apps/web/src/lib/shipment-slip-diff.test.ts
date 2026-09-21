import { describe, expect, it } from "vitest";
import { diffShipmentSlip, SlipForCompare } from "./shipment-slip-diff";

const base: SlipForCompare = {
  slipDate: new Date("2026-09-16T17:00:00.000Z"), // 17/09/2026 giờ VN
  items: [
    { poSaleNumber: "PO1", itemCode: "A", itemName: "Hàng A", qtyActual: 100 },
    { poSaleNumber: "PO1", itemCode: "B", itemName: "Hàng B", qtyActual: 50 },
  ],
};

describe("diffShipmentSlip", () => {
  it("trùng hệt (kể cả khác thứ tự dòng, SL dạng Decimal/chuỗi) → không có khác biệt", () => {
    const incoming: SlipForCompare = {
      slipDate: new Date("2026-09-16T17:00:00.000Z"),
      items: [
        { poSaleNumber: "PO1", itemCode: "B", itemName: "Hàng B", qtyActual: "50.00" },
        { poSaleNumber: "PO1", itemCode: "A", itemName: "Hàng A", qtyActual: 100 },
      ],
    };
    expect(diffShipmentSlip(base, incoming)).toEqual([]);
  });

  it("khác SL, thêm dòng, bỏ dòng, đổi ngày → liệt kê từng khác biệt", () => {
    const incoming: SlipForCompare = {
      slipDate: new Date("2026-09-17T17:00:00.000Z"),
      items: [
        { poSaleNumber: "PO1", itemCode: "A", itemName: "Hàng A", qtyActual: 120 },
        { poSaleNumber: "PO2", itemCode: "C", itemName: "Hàng C", qtyActual: 5 },
      ],
    };
    const d = diffShipmentSlip(base, incoming);
    expect(d).toContain("Ngày phiếu: 17/09/2026 → 18/09/2026");
    expect(d).toContain("PO1 / A: SL 100 → 120");
    expect(d).toContain("Bỏ dòng PO1 / B (SL 50)");
    expect(d).toContain("Thêm dòng PO2 / C (SL 5)");
  });

  it("cùng mã hàng xuất hiện 2 dòng thì cộng SL trước khi so", () => {
    const incoming: SlipForCompare = {
      slipDate: base.slipDate,
      items: [
        { poSaleNumber: "PO1", itemCode: "A", itemName: "Hàng A", qtyActual: 60 },
        { poSaleNumber: "PO1", itemCode: "A", itemName: "Hàng A", qtyActual: 40 },
        { poSaleNumber: "PO1", itemCode: "B", itemName: "Hàng B", qtyActual: 50 },
      ],
    };
    expect(diffShipmentSlip(base, incoming)).toEqual([]);
  });
});
