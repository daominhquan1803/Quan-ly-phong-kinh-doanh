import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { classifyInvoiceStatus, parseDebtNewInvoicesExcel } from "./debt-new-invoices-parser";
import { isFuzzyDuplicate, paymentDescKey } from "./debt-payment-dedupe";

describe("classifyInvoiceStatus", () => {
  it("phân loại đúng các trạng thái thật của AMIS (T8-T9/2026)", () => {
    expect(classifyInvoiceStatus("Hoá đơn mới").kind).toBe("NORMAL");
    expect(classifyInvoiceStatus("Hóa đơn đã bị thay thế bởi hóa đơn số 00002617")).toEqual({ kind: "SUPERSEDED", refs: ["00002617"] });
    expect(classifyInvoiceStatus("Hoá đơn thay thế cho hóa đơn số 00002625")).toEqual({ kind: "REPLACEMENT", refs: ["00002625"] });
    expect(classifyInvoiceStatus("Hoá đơn điều chỉnh cho hóa đơn số 00002472")).toEqual({ kind: "ADJUSTMENT", refs: ["00002472"] });
    expect(classifyInvoiceStatus("Hoá đơn điều chỉnh cho hóa đơn  số 00000865").refs).toEqual(["00000865"]); // 2 dấu cách như file thật
    expect(classifyInvoiceStatus("Hoá đơn điều chỉnh").kind).toBe("ADJUSTMENT");
    expect(classifyInvoiceStatus("Hóa đơn đã bị điều chỉnh bởi hóa đơn số 00002800, 00003049, 00003050")).toEqual({
      kind: "ADJUSTED_ORIGINAL",
      refs: ["00002800", "00003049", "00003050"],
    });
    expect(classifyInvoiceStatus("Hóa đơn đã bị điều chỉnh").kind).toBe("ADJUSTED_ORIGINAL");
    expect(classifyInvoiceStatus("Hoá đơn bị điều chỉnh").kind).toBe("ADJUSTED_ORIGINAL");
  });
});

function sheet(rows: (string | number)[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ["BẢNG KÊ HOÁ ĐƠN ĐÃ SỬ DỤNG"],
    ["Tháng 9 năm 2026"],
    [],
    ["Số hóa đơn", "Ngày hóa đơn", "Tên khách hàng", "Tổng tiền quy đổi", "Trạng thái hóa đơn", "Mã nhân viên", "Mã khách hàng"],
    ...rows,
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "S");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

describe("parseDebtNewInvoicesExcel — thay thế / điều chỉnh / khách ngoài phòng", () => {
  const r = parseDebtNewInvoicesExcel(
    sheet([
      ["00002681", "04/09/2026", "SHINMEI", 15768000, "Hoá đơn thay thế cho hóa đơn số 00002507", "THANHTUNG", "C.SHINMEI-VN"],
      ["00002315", "04/08/2026", "PANASONIC", 46810000, "Hóa đơn đã bị thay thế bởi hóa đơn số 00002617", "PHAMDUNG", "C.PANASONIC"],
      ["00002707", "08/09/2026", "PANASONIC", 40576464, "Hóa đơn đã bị điều chỉnh bởi hóa đơn số 00002800", "PHAMDUNG", "C.PANASONIC"],
      ["00002800", "17/09/2026", "PANASONIC", 3240, "Hoá đơn điều chỉnh cho hóa đơn số 00002707", "PHAMDUNG", "C.PANASONIC"],
      ["00002735", "10/09/2026", "VNPT", -103709808, "Hoá đơn điều chỉnh cho hóa đơn số 00002472", "MINHQUAN", "C.VNPTHANOI"],
      ["00002911", "25/09/2026", "BOSHOKU", 0, "Hoá đơn điều chỉnh cho hóa đơn số 00002110", "MINHQUAN", "C.BOSHOKU"],
      ["00002612", "27/08/2026", "INTERPLEX", 107248770, "Hoá đơn mới", "DANGTAN", "INTERPLEX-HN."],
      ["00002362", "09/08/2026", "PAVICO", 26244000, "Hoá đơn mới", "DANGTAN", "PAVICO"],
      ["00002331", "06/08/2026", "SHENYAN", 10500000, "Hoá đơn mới", "THANHTUNG", "C.SHENYANVIETNAM"],
    ])
  );

  it("hoá đơn thay thế ĐƯỢC nhập (trước đây bị bỏ nhầm) và ghi số hoá đơn cũ nó thay", () => {
    const row = r.rows.find((x) => x.invoiceNumber === "00002681")!;
    expect(row).toMatchObject({ customerCode: "SHINMEI-VN", originalAmount: 15768000, kind: "REPLACEMENT", replaces: ["00002507"] });
  });

  it("hoá đơn cũ/gốc bị thay thế hoặc điều chỉnh không nhập, đưa vào danh sách xoá", () => {
    expect(r.rows.find((x) => x.invoiceNumber === "00002315")).toBeUndefined();
    expect(r.rows.find((x) => x.invoiceNumber === "00002707")).toBeUndefined();
    expect(r.skippedReplaced).toBe(2);
    expect(r.removals).toContainEqual({ customerCode: "PANASONIC", invoiceNumber: "00002315", reason: "REPLACED", replacedBy: "00002617" });
    expect(r.removals).toContainEqual({ customerCode: "PANASONIC", invoiceNumber: "00002707", reason: "ADJUSTED", replacedBy: "00002800" });
  });

  it("hoá đơn điều chỉnh dương: nhập + xoá hoá đơn gốc; điều chỉnh âm/0 đồng: không nhập nhưng vẫn xoá hoá đơn gốc", () => {
    expect(r.rows.find((x) => x.invoiceNumber === "00002800")).toMatchObject({ kind: "ADJUSTMENT", replaces: ["00002707"] });
    expect(r.rows.find((x) => x.invoiceNumber === "00002735")).toBeUndefined();
    expect(r.rows.find((x) => x.invoiceNumber === "00002911")).toBeUndefined();
    expect(r.skippedNonPositiveAdjustment).toBe(2);
    expect(r.removals).toContainEqual({ customerCode: "VNPTHANOI", invoiceNumber: "00002472", reason: "ADJUSTED", replacedBy: null });
    expect(r.errors).toEqual([]); // điều chỉnh 0 đồng không còn báo lỗi "sai tổng tiền"
  });

  it("khách không thuộc phòng (Interplex, Pavico) bị bỏ qua hoàn toàn", () => {
    expect(r.rows.map((x) => x.invoiceNumber)).not.toContain("00002612");
    expect(r.rows.map((x) => x.invoiceNumber)).not.toContain("00002362");
    expect(r.skippedNonPkd1).toBe(2);
    expect(r.rows.map((x) => x.invoiceNumber)).toContain("00002331"); // hoá đơn mới bình thường vẫn nhập
  });
});

describe("chống nhập trùng Tiền về theo số tiền + nội dung", () => {
  const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
  const desc = "Thu tiền khách hàng CÔNG TY TNHH NAM DƯỢC theo hóa đơn 00002824";
  const key = (amount: number, date: Date | null, text = desc) => ({ amount, date, descKey: paymentDescKey(text) });

  it("cùng số tiền + nội dung, mã khách khác nhau vẫn là trùng", () => {
    expect(isFuzzyDuplicate(key(7803972, d("2026-10-08")), key(7803972, d("2026-10-08")))).toBe(true);
  });
  it("ngày lệch ít (<= 10 ngày) vẫn trùng; lệch nhiều (tháng khác) là giao dịch khác", () => {
    expect(isFuzzyDuplicate(key(100, d("2026-10-08")), key(100, d("2026-10-12")))).toBe(true);
    expect(isFuzzyDuplicate(key(100, d("2026-10-08")), key(100, d("2026-11-20")), new Date("2026-12-01"))).toBe(false);
  });
  it("ngày vô lý (năm 2027+ do đọc sai) hoặc thiếu ngày -> coi là trùng nếu nội dung giống hệt", () => {
    expect(isFuzzyDuplicate(key(100, d("2027-05-08")), key(100, d("2026-09-16")), new Date("2026-10-16"))).toBe(true);
    expect(isFuzzyDuplicate(key(100, null), key(100, d("2026-09-16")))).toBe(true);
  });
  it("khác số tiền hoặc nội dung ngắn/chung chung -> không coi là trùng", () => {
    expect(isFuzzyDuplicate(key(100, d("2026-10-08")), key(101, d("2026-10-08")))).toBe(false);
    expect(isFuzzyDuplicate(key(100, d("2026-10-08"), "chuyen tien"), key(100, d("2026-10-08"), "chuyen tien"))).toBe(false);
  });
});
