import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { excelCellToDate, parsePoTrackingExcel } from "@hoanggia/db";

const ymd = (d: Date | null) => (d ? [d.getFullYear(), d.getMonth() + 1, d.getDate()] : null);

describe("excelCellToDate", () => {
  it("serial nguyên ngày -> đúng ngày dương lịch (không lùi 1 ngày dù múi giờ máy chạy test)", () => {
    // 46270 = 05/09/2026
    expect(ymd(excelCellToDate(46270))).toEqual([2026, 9, 5]);
    expect(ymd(excelCellToDate(46270.5))).toEqual([2026, 9, 5]);
    expect(ymd(excelCellToDate(46270.9999999))).toEqual([2026, 9, 5]);
  });

  it("Date rơi vào 23:59:30 hôm trước (lỗi cellDates ở múi giờ +7) vẫn ra đúng ngày", () => {
    expect(ymd(excelCellToDate(new Date(2026, 8, 4, 23, 59, 30)))).toEqual([2026, 9, 5]);
    expect(ymd(excelCellToDate(new Date(2026, 8, 5, 0, 0, 0)))).toEqual([2026, 9, 5]);
  });

  it("giá trị không phải ngày -> null", () => {
    expect(excelCellToDate("05/09/2026")).toBeNull();
    expect(excelCellToDate(12)).toBeNull();
    expect(excelCellToDate(null)).toBeNull();
  });
});

describe("parsePoTrackingExcel — ngày giao", () => {
  it("đọc ngày PO và ngày giao đúng ngày trong file", () => {
    const ws: XLSX.WorkSheet = {};
    // 2 dòng tiêu đề, dòng 3 là dữ liệu (i = 2)
    const put = (col: number, row: number, v: string | number, isDate = false) => {
      ws[XLSX.utils.encode_cell({ c: col, r: row })] = isDate ? { t: "n", v: v as number, z: "dd/mm/yyyy" } : typeof v === "number" ? { t: "n", v } : { t: "s", v };
    };
    put(0, 0, "NVKD");
    put(0, 2, "TANDT");
    put(3, 2, "D08.26DT03A");
    put(4, 2, "AA05223");
    put(9, 2, 46235, true); // 01/08/2026
    put(10, 2, 20);
    put(13, 2, 11506000);
    put(17, 2, 46270, true); // 05/09/2026
    put(18, 2, 19);
    put(19, 2, 218614000);
    put(29, 2, 230120000);
    ws["!ref"] = "A1:AG3";
    const buf = XLSX.write({ SheetNames: ["Sheet1"], Sheets: { Sheet1: ws } }, { type: "buffer", bookType: "xlsx" });
    const rows = parsePoTrackingExcel(buf as Buffer);
    expect(rows).toHaveLength(1);
    expect(ymd(rows[0].poDate)).toEqual([2026, 8, 1]);
    expect(ymd(rows[0].delivery1?.date ?? null)).toEqual([2026, 9, 5]);
  });
});
