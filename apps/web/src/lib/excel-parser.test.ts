import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { previewExcel, parseWithMapping } from "./excel-parser";

function makeBuffer(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const HEADERS = ["Mã đơn hàng", "Khách hàng", "Nhân viên kinh doanh", "Ngày giao hàng", "Thành tiền"];

describe("previewExcel", () => {
  it("reads headers and sample rows", () => {
    const buffer = makeBuffer([
      HEADERS,
      ["DH001", "Công ty A", "Tấn", "13/08/2026", 1000000],
      ["DH002", "Công ty B", "Hương", "14/08/2026", 2500000],
    ]);
    const preview = previewExcel(buffer);
    expect(preview.headers).toEqual(HEADERS);
    expect(preview.totalRows).toBe(2);
    expect(preview.sampleRows[0][0]).toBe("DH001");
  });
});

describe("parseWithMapping", () => {
  const mapping = {
    orderCode: "Mã đơn hàng",
    customerName: "Khách hàng",
    salesEmployeeNameRaw: "Nhân viên kinh doanh",
    expectedDeliveryDate: "Ngày giao hàng",
    totalValue: "Thành tiền",
  };

  it("parses valid rows into typed order records", () => {
    const buffer = makeBuffer([HEADERS, ["DH001", "Công ty A", "Tấn", "13/08/2026", "1.000.000"]]);
    const { rows, errors } = parseWithMapping(buffer, mapping);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].orderCode).toBe("DH001");
    expect(rows[0].totalValue).toBe(1000000);
    expect(rows[0].expectedDeliveryDate?.getFullYear()).toBe(2026);
    expect(rows[0].expectedDeliveryDate?.getMonth()).toBe(7); // 0-indexed: tháng 8
  });

  it("reports an error for rows missing required fields", () => {
    const buffer = makeBuffer([HEADERS, ["", "Công ty A", "Tấn", "13/08/2026", "1000000"]]);
    const { rows, errors } = parseWithMapping(buffer, mapping);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/Mã đơn hàng/);
  });

  it("silently skips fully blank rows", () => {
    const buffer = makeBuffer([HEADERS, ["", "", "", "", ""]]);
    const { rows, errors } = parseWithMapping(buffer, mapping);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });
});
