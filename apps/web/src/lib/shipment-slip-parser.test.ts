import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseShipmentSlipsWithMapping } from "./shipment-slip-parser";

function makeBuffer(rows: (string | number)[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const HEADERS = [
  "Số phiếu",
  "Khách hàng",
  "Người nhận hàng",
  "Mã hàng",
  "Tên hàng",
  "Kho",
  "Số PO bán",
  "ĐVT",
  "SL yêu cầu",
  "SL thực xuất",
];
const mapping = {
  slipNumber: "Số phiếu",
  customerName: "Khách hàng",
  receiverName: "Người nhận hàng",
  itemCode: "Mã hàng",
  itemName: "Tên hàng",
  warehouse: "Kho",
  poSaleNumber: "Số PO bán",
  unit: "ĐVT",
  qtyRequested: "SL yêu cầu",
  qtyActual: "SL thực xuất",
} as const;

describe("parseShipmentSlipsWithMapping", () => {
  it("groups multiple item rows sharing the same Số phiếu into 1 slip", () => {
    const buffer = makeBuffer([
      HEADERS,
      ["BH03265", "SAMSUNG", "Mr Phú", "SI08244", "Tem niêm phong thùng hàng", "KHO S", "D08.26NT20A", "Cái", 1000000, 260000],
      ["BH03265", "SAMSUNG", "Mr Phú", "SI08245", "Tem niêm phong thùng hàng 2", "KHO S", "D08.26NT20A", "Cái", 500, 500],
    ]);
    const { slips, errors } = parseShipmentSlipsWithMapping(buffer, mapping);
    expect(errors).toHaveLength(0);
    expect(slips).toHaveLength(1);
    expect(slips[0].slipNumber).toBe("BH03265");
    expect(slips[0].customerName).toBe("SAMSUNG");
    expect(slips[0].items).toHaveLength(2);
    expect(slips[0].items[0]).toMatchObject({ itemCode: "SI08244", qtyActual: 260000 });
    expect(slips[0].items[1]).toMatchObject({ itemCode: "SI08245", qtyActual: 500 });
  });

  it("splits rows into separate slips when Số phiếu differs", () => {
    const buffer = makeBuffer([
      HEADERS,
      ["BH03265", "SAMSUNG", "Mr Phú", "SI08244", "Tem A", "KHO S", "PO1", "Cái", 100, 100],
      ["BH03266", "WOOJEON", "Mr Nam", "SI08246", "Tem B", "KHO S", "PO2", "Cái", 50, 50],
    ]);
    const { slips } = parseShipmentSlipsWithMapping(buffer, mapping);
    expect(slips).toHaveLength(2);
    expect(slips.map((s) => s.slipNumber)).toEqual(["BH03265", "BH03266"]);
  });

  it("reports a row error when Số phiếu is missing but Tên hàng is present", () => {
    const buffer = makeBuffer([HEADERS, ["", "SAMSUNG", "Mr Phú", "SI08244", "Tem A", "KHO S", "PO1", "Cái", 100, 100]]);
    const { slips, errors } = parseShipmentSlipsWithMapping(buffer, mapping);
    expect(slips).toHaveLength(0);
    expect(errors).toEqual([{ rowNumber: 2, message: "Thiếu Số phiếu" }]);
  });

  it("reports a row error when Tên hàng is missing but Số phiếu is present", () => {
    const buffer = makeBuffer([HEADERS, ["BH03265", "SAMSUNG", "Mr Phú", "SI08244", "", "KHO S", "PO1", "Cái", 100, 100]]);
    const { errors } = parseShipmentSlipsWithMapping(buffer, mapping);
    expect(errors).toEqual([{ rowNumber: 2, message: "Thiếu Tên hàng" }]);
  });

  it("silently skips fully blank rows", () => {
    const buffer = makeBuffer([HEADERS, ["", "", "", "", "", "", "", "", "", ""]]);
    const { slips, errors } = parseShipmentSlipsWithMapping(buffer, mapping);
    expect(slips).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
