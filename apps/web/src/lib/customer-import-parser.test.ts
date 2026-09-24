import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseCustomerListExcel } from "./customer-import-parser";

function makeBuffer(rows: (string | number)[][]): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

const HEADER5 = ["Mã khách hàng", "Tên khách hàng", "Thời hạn công nợ", "Nhân viên", "Email"];
const HEADER4 = HEADER5.slice(0, 4);

describe("parseCustomerListExcel - cột Email (cột thứ 5)", () => {
  it("đọc email ở cột thứ 5", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER5, ["KH1", "Công ty A", 30, "Tùng", "ketoan@a.com"]]));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("ketoan@a.com");
    expect(rows[0].customerName).toBe("Công ty A");
    expect(rows[0].paymentTermDays).toBe(30);
  });

  it("nhiều email trong 1 ô (cách nhau , hoặc ;) -> chuẩn hoá join(', ')", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER5, ["KH1", "A", 30, "Tùng", " a@x.com ;b@y.com,  c@z.com "]]));
    expect(rows[0].email).toBe("a@x.com, b@y.com, c@z.com");
  });

  it("tương thích ngược: file cũ 4 cột vẫn chạy, email = null", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER4, ["KH1", "Công ty A", 30, "Tùng"]]));
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBeNull();
    expect(rows[0].employeeNameRaw).toBe("Tùng");
  });

  it("ô email để trống -> null", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER5, ["KH1", "A", 30, "Tùng", ""]]));
    expect(rows[0].email).toBeNull();
  });

  it("gộp mã trùng: giữ email KHÔNG rỗng đầu tiên gặp được", () => {
    const { rows, mergedFromDuplicates } = parseCustomerListExcel(
      makeBuffer([
        HEADER5,
        ["KH1", "A", 30, "Tùng", ""], // dòng đầy đủ nhưng chưa có email
        ["KH1", "", "", "", "first@a.com"], // dòng trùng có email
        ["KH1", "", "", "", "second@a.com"], // email thứ 2 không được ghi đè
      ])
    );
    expect(mergedFromDuplicates).toBe(2);
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("first@a.com");
  });

  it("gộp mã trùng: email đã có ở dòng đầu thì dòng sau (rỗng) không xoá", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER5, ["KH1", "A", 30, "Tùng", "a@x.com"], ["KH1", "", "", "", ""]]));
    expect(rows[0].email).toBe("a@x.com");
  });

  it("parser KHÔNG validate email — địa chỉ sai vẫn được giữ để route import quyết định (bỏ qua + báo)", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER5, ["KH1", "A", 30, "Tùng", "a@x.com; abc"]]));
    expect(rows[0].email).toBe("a@x.com, abc");
  });

  it("dòng không có mã khách hàng bị bỏ qua dù có email", () => {
    const { rows } = parseCustomerListExcel(makeBuffer([HEADER5, ["", "A", 30, "Tùng", "a@x.com"]]));
    expect(rows).toHaveLength(0);
  });
});
