import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { detectMonthColumns, parseSalesPlanWithMapping } from "./sales-plan-parser";

function makeBuffer(sheets: Record<string, (string | number)[][]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("detectMonthColumns", () => {
  it("matches pivot-style month headers for the requested year", () => {
    const headers = ["Tên nhân viên bán hàng", "Sản phẩm", " Total 2025  ", "Thg1.25", "Thg1.26", "Thg4.26", " FC 2026 "];
    const found = detectMonthColumns(headers, 2026);
    expect(found).toEqual([
      { header: "Thg1.26", month: 1, year: 2026 },
      { header: "Thg4.26", month: 4, year: 2026 },
    ]);
  });

  it("returns nothing when no month column matches the requested year", () => {
    const headers = ["Tên nhân viên bán hàng", "Doanh số mục tiêu"];
    expect(detectMonthColumns(headers, 2026)).toHaveLength(0);
  });
});

describe("parseSalesPlanWithMapping — narrow mode (1 cột doanh số)", () => {
  const HEADERS = ["Nhân viên kinh doanh", "Nhóm hàng", "Doanh số mục tiêu"];
  const mapping = { employeeName: "Nhân viên kinh doanh", productGroup: "Nhóm hàng", targetRevenue: "Doanh số mục tiêu" };

  it("applies the chosen year/month to every row", () => {
    const buffer = makeBuffer({ Sheet1: [HEADERS, ["Đào Minh Quân", "Thương mại", "500000000"]] });
    const { rows, errors, wideMode } = parseSalesPlanWithMapping(buffer, mapping, 2026, 5);
    expect(wideMode).toBe(false);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      expect.objectContaining({ employeeName: "Đào Minh Quân", year: 2026, month: 5, targetRevenue: 500000000 }),
    ]);
  });
});

describe("parseSalesPlanWithMapping — wide mode (pivot, 1 cột/tháng)", () => {
  const HEADERS = ["Tên nhân viên bán hàng", "Sản phẩm", "Nhóm hàng", "Thg1.26", "Thg2.26", "Thg4.26"];
  const mapping = {
    employeeName: "Tên nhân viên bán hàng",
    productName: "Sản phẩm",
    productGroup: "Nhóm hàng",
  };

  it("auto-detects month columns and emits 1 row per non-empty month cell", () => {
    const buffer = makeBuffer({
      Sheet1: [HEADERS, ["Đặng Văn Tấn", "Băng keo", "Thương mại", 100, "", 300]],
    });
    const { rows, wideMode } = parseSalesPlanWithMapping(buffer, mapping, 2026, 1);
    expect(wideMode).toBe(true);
    expect(rows).toHaveLength(2); // tháng 2 để trống -> bỏ qua
    expect(rows.map((r) => r.month)).toEqual([1, 4]);
    expect(rows.every((r) => r.employeeName === "Đặng Văn Tấn" && r.year === 2026)).toBe(true);
    expect(rows[1].targetRevenue).toBe(300);
  });

  it("skips blank-employee rows (vd dòng 'Grand Total' cuối pivot table)", () => {
    const buffer = makeBuffer({
      Sheet1: [HEADERS, ["Đặng Văn Tấn", "Băng keo", "Thương mại", 100, 200, 300], ["", "", "", 999, 999, 999]],
    });
    const { rows } = parseSalesPlanWithMapping(buffer, mapping, 2026, 1);
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.employeeName === "Đặng Văn Tấn")).toBe(true);
  });
});

describe("parseSalesPlanWithMapping — chọn sheet không phải sheet đầu tiên", () => {
  it("reads the requested sheet instead of always the first one", () => {
    const buffer = makeBuffer({
      Sheet1: [["Ghi chú"], ["sheet không dùng"]],
      Sheet2: [
        ["Tên nhân viên bán hàng", "Thg1.26"],
        ["Ngô Thanh Tùng.", 123456],
      ],
    });
    const mapping = { employeeName: "Tên nhân viên bán hàng" };
    const { rows } = parseSalesPlanWithMapping(buffer, mapping, 2026, 1, "Sheet2");
    expect(rows).toHaveLength(1);
    expect(rows[0].employeeName).toBe("Ngô Thanh Tùng.");
    expect(rows[0].targetRevenue).toBe(123456);
  });
});
