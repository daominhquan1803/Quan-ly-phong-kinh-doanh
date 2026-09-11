import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { previewExcel, parseWithMapping, parseExcelDate } from "./excel-parser";

function makeBuffer(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/** Dựng 1 file có Ô NGÀY DẠNG SỐ thật (Excel serial date + định dạng ngày, KHÔNG phải chữ) tại
 * đúng cột `dateColIndex` (0-based) — đúng kiểu ô đã gây lỗi thật (phiếu BH03614 lùi mất 1 ngày,
 * 08/09 hiện thành 07/09). Excel serial 46273 = 08/09/2026 (đếm ngày từ 30/12/1899, ngày Excel
 * không có phần thập phân giờ). Các cột còn lại điền theo `row` bình thường (giá trị tại
 * `dateColIndex` trong `row` chỉ là placeholder, sẽ bị ghi đè lại bằng cell dạng số). */
function makeBufferWithNumericDateCell(
  headers: string[],
  row: (string | number)[],
  dateColIndex: number,
  serial: number
): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([headers, row]);
  const addr = XLSX.utils.encode_cell({ r: 1, c: dateColIndex });
  sheet[addr] = { t: "n", v: serial, z: "m/d/yy" };
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

  // Lỗi thật anh Quân báo: phiếu BH03614 trong file Excel để ngày 08/09/2026, nhưng app hiện
  // 07/09/2026 — nguyên nhân là ô ngày đó lưu dạng SỐ (Excel serial 46273, không phải chữ
  // "08/09/2026" như đa số dòng khác trong cùng cột), và đọc file với cellDates:true khiến thư
  // viện xlsx tự quy đổi số 46273 thành "2026-09-07T16:59:30.000Z" (lệch 30 giây, đủ để rơi sang
  // NGÀY HÔM TRƯỚC khi tính theo giờ Việt Nam) thay vì đúng "2026-09-07T17:00:00.000Z" (= đúng
  // 00:00 ngày 08/09 giờ VN). Đã sửa bằng cách không dùng cellDates:true nữa, để ô ngày dạng số
  // giữ nguyên là number rồi tự quy đổi qua XLSX.SSF.parse_date_code() — chính xác tuyệt đối.
  it("đọc đúng ngày cho Ô NGÀY DẠNG SỐ (Excel serial date) — không bị lùi 1 ngày như lỗi cellDates cũ", () => {
    const buffer = makeBufferWithNumericDateCell(
      HEADERS,
      ["DH001", "Công ty A", "Tấn", "", "1000000"],
      3, // cột "Ngày giao hàng" (0-based index thứ 4 trong HEADERS)
      46273 // = 08/09/2026, ghi thẳng dạng serial số giống hệt file lỗi thật
    );
    const mappingNumeric = {
      orderCode: "Mã đơn hàng",
      customerName: "Khách hàng",
      salesEmployeeNameRaw: "Nhân viên kinh doanh",
      expectedDeliveryDate: "Ngày giao hàng",
      totalValue: "Thành tiền",
    };
    const { rows, errors } = parseWithMapping(buffer, mappingNumeric);
    expect(errors).toHaveLength(0);
    const d = rows[0].expectedDeliveryDate;
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8); // 0-indexed: tháng 9
    expect(d?.getDate()).toBe(8); // KHÔNG được là 7 (lỗi cũ lùi mất 1 ngày)
  });
});

describe("parseExcelDate với Excel serial date dạng số", () => {
  it("quy đổi đúng serial nguyên (không phần thập phân) thành đúng ngày, không lệch giây", () => {
    // 46273 phải ra đúng 08/09/2026 00:00:00 — không phải 07/09 23:59:30 như lỗi cellDates cũ.
    const d = parseExcelDate(46273);
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(8);
    expect(d?.getDate()).toBe(8);
    expect(d?.getHours()).toBe(0);
    expect(d?.getMinutes()).toBe(0);
    expect(d?.getSeconds()).toBe(0);
  });
});
