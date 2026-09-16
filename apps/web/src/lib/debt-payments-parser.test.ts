import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseDebtPaymentsExcel, extractInvoiceNumbersFromDescription } from "./debt-payments-parser";

function makeBuffer(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

describe("parseDebtPaymentsExcel", () => {
  // Đúng cấu trúc file thật "Tiền về" — KHÔNG có dòng tiêu đề, 2 dòng trống đầu, 7 cột: Ngày, Mã
  // KH, Tên KH, Mô tả, Số tiền, (trống), Ghi chú. Bug thật đã gặp: nhầm cột do tin theo cách
  // markitdown hiển thị "Unnamed: 0..7" (8 cột, có 1 cột trống đầu ảo) thay vì đọc thẳng file gốc
  // chỉ có 7 cột thật — khiến TOÀN BỘ dòng bị lỗi "Thiếu hoặc sai số tiền" khi đọc bằng xlsx thật.
  const rows: (string | number)[][] = [
    ["", "", "", "", "", "", ""],
    [
      "2026-09-04",
      "E.JNC FILTER",
      "CÔNG TY TNHH JNC FILTER VIỆT NAM",
      "Thu tiền khách hàng CÔNG TY TNHH JNC FILTER VIỆT NAM theo hóa đơn 00002337",
      1944000,
      "",
      "",
    ],
    ["2026-09-04", "C.NCL", "Công ty CP Thương mại NCL", "Đặt cọc, không rõ hoá đơn", 6264000, "", ""],
  ];

  it("đọc đúng cột theo cấu trúc file thật (không dòng tiêu đề)", () => {
    const { rows: parsed, errors } = parseDebtPaymentsExcel(makeBuffer(rows));
    expect(errors).toHaveLength(0);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].customerCodeRaw).toBe("E.JNC FILTER");
    expect(parsed[0].customerCode).toBe("JNC FILTER");
    expect(parsed[0].amount).toBe(1944000);
    expect(parsed[0].candidateInvoiceNumbers).toEqual(["00002337"]);
    expect(parsed[1].amount).toBe(6264000);
    expect(parsed[1].candidateInvoiceNumbers).toEqual([]);
  });
});

describe("sourceHash chống trùng", () => {
  const rows: (string | number)[][] = [
    ["2026-09-04", "E.JNC FILTER", "CÔNG TY TNHH JNC FILTER VIỆT NAM", "theo hóa đơn 00002337", 1944000, "", ""],
    ["2026-09-04", "C.NCL", "Công ty CP Thương mại NCL", "Đặt cọc", 6264000, "", ""],
  ];

  it("cùng nội dung dòng (up lại đúng file) -> sourceHash giống hệt nhau", () => {
    const first = parseDebtPaymentsExcel(makeBuffer(rows)).rows;
    const second = parseDebtPaymentsExcel(makeBuffer(rows)).rows;
    expect(first[0].sourceHash).toBe(second[0].sourceHash);
    expect(first[1].sourceHash).toBe(second[1].sourceHash);
  });

  it("2 dòng khác nội dung -> sourceHash khác nhau", () => {
    const parsed = parseDebtPaymentsExcel(makeBuffer(rows)).rows;
    expect(parsed[0].sourceHash).not.toBe(parsed[1].sourceHash);
  });
});

describe("extractInvoiceNumbersFromDescription", () => {
  it("tìm 1 số hoá đơn sau cụm 'hóa đơn'", () => {
    expect(extractInvoiceNumbersFromDescription("Thu tiền theo hóa đơn 00002337")).toEqual(["00002337"]);
  });

  it("tìm nhiều số hoá đơn cách nhau bởi dấu phẩy", () => {
    expect(extractInvoiceNumbersFromDescription("Thu tiền theo hóa đơn 00001974, 00002081")).toEqual([
      "00001974",
      "00002081",
    ]);
  });

  it("đệm về đủ 8 chữ số khi số hoá đơn viết ngắn", () => {
    expect(extractInvoiceNumbersFromDescription("tt tien in tem hoa don 651,2202,2093")).toEqual([
      "00000651",
      "00002202",
      "00002093",
    ]);
  });

  it("không có cụm hoá đơn -> mảng rỗng", () => {
    expect(extractInvoiceNumbersFromDescription("VNPTTech 201 25 Thanh toan 100 gia tri PO sau giao hang")).toEqual([]);
  });
});
