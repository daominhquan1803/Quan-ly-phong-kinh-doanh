import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseShipmentSlipsWithMapping } from "./shipment-slip-parser";
import { SHIPMENT_SLIP_FIELDS, ShipmentSlipFieldKey } from "./shipment-slip-fields";
import { suggestMapping } from "./column-mapper";
import { slipInfoChanged, diffShipmentSlip } from "./shipment-slip-diff";

// File phiếu đi hàng admin tải lên (ảnh anh Quân gửi 15/10/2026): có thêm cột "Số PO/ Mã hàng của khách" + "Ghi chú" và "Giá tiền".
const HEADERS = [
  "Số phiếu giao hàng",
  "Tên khách hàng",
  "Mã hàng",
  "Tên hàng",
  "Giá tiền",
  "Số PO bán",
  "Đơn vị",
  "Số lượng thực xuất",
  "Ngày xuất kho",
  "Số PO/ Mã hàng của khách",
  "Ghi chú",
];

function makeBuffer(rows: (string | number)[][]): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("tự nhận cột cho file phiếu đi hàng có thêm 3 cột", () => {
  it("nhận đúng Số PO/Mã hàng của khách, Ghi chú, Giá tiền; không nhầm với Số PO bán", () => {
    const m = suggestMapping<ShipmentSlipFieldKey>(HEADERS, SHIPMENT_SLIP_FIELDS);
    expect(m.poCustomerItemCode).toBe("Số PO/ Mã hàng của khách");
    expect(m.note).toBe("Ghi chú");
    expect(m.unitPrice).toBe("Giá tiền");
    expect(m.poSaleNumber).toBe("Số PO bán");
    expect(m.slipNumber).toBe("Số phiếu giao hàng");
    expect(m.itemCode).toBe("Mã hàng");
  });
});

describe("đọc file: ghi nhận đủ thông tin các dòng hàng", () => {
  it("lưu Số PO/Mã hàng của khách, Ghi chú, Giá tiền từng dòng (dòng trống = null)", () => {
    const mapping = suggestMapping<ShipmentSlipFieldKey>(HEADERS, SHIPMENT_SLIP_FIELDS);
    const buf = makeBuffer([
      HEADERS,
      ["BH04290", "CÔNG TY A", "GCN04106", "Màng PE", 98400, "D09.26DT6", "Cuộn", 5, "14/10/2026", "PO SS(V)-20260914-01", "Sản xuất"],
      ["BH04290", "CÔNG TY A", "AA20016", "Mực in", 243000, "D09.26DT6", "Cuộn", 39, "14/10/2026", "", ""],
    ]);
    const { slips, errors } = parseShipmentSlipsWithMapping(buf, mapping);
    expect(errors).toEqual([]);
    expect(slips[0].items[0]).toMatchObject({ poCustomerItemCode: "PO SS(V)-20260914-01", note: "Sản xuất", unitPrice: 98400 });
    expect(slips[0].items[1]).toMatchObject({ poCustomerItemCode: null, note: null, unitPrice: 243000 });
  });
});

describe("slipInfoChanged — cập nhật phiếu đã nhập khi file mới có thêm thông tin", () => {
  const item = (o: Record<string, unknown> = {}) => ({ poSaleNumber: "PO1", itemCode: "A", itemName: "Hàng A", qtyActual: 10, ...o });

  it("phiếu cũ chưa có thông tin bổ sung, file mới có -> đổi; số liệu vẫn trùng nên không phải xung đột", () => {
    const old = [item()];
    const next = [item({ poCustomerItemCode: "PO-KH-1", note: "Sản xuất", unitPrice: 100 })];
    expect(diffShipmentSlip({ slipDate: null, items: old }, { slipDate: null, items: next })).toEqual([]);
    expect(slipInfoChanged(old, next)).toBe(true);
  });

  it("giống hệt (kể cả Decimal/chuỗi, khoảng trắng thừa) -> không đổi", () => {
    const a = [item({ poCustomerItemCode: "X1", note: "Ghi chú", unitPrice: "100.00" })];
    const b = [item({ poCustomerItemCode: " X1 ", note: "Ghi chú", unitPrice: 100 })];
    expect(slipInfoChanged(a, b)).toBe(false);
  });

  it("cùng mã hàng 2 dòng: so theo thứ tự trong nhóm", () => {
    const a = [item({ note: "lần 1" }), item({ note: "lần 2" })];
    expect(slipInfoChanged(a, [item({ note: "lần 1" }), item({ note: "lần 2" })])).toBe(false);
    expect(slipInfoChanged(a, [item({ note: "lần 1" }), item({ note: "khác" })])).toBe(true);
  });
});
