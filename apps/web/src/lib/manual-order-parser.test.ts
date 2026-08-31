import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseManualOrderExcel, ManualOrderParseError } from "./manual-order-parser";

/** Dựng lại đúng khung mẫu "Đơn đặt hàng" nội bộ Hoàng Gia (rút gọn, giữ đúng các dòng nhãn +
 * bảng mã hàng như file thật) — để test không phụ thuộc file mẫu bên ngoài repo. */
function makeOrderBuffer(rows: unknown[][]): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, sheet, "PKD");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function baseRows(itemRows: unknown[][], extraTailRows: unknown[][] = []): unknown[][] {
  return [
    [],
    ["", "", "", "", "", "", "CÔNG TY TNHH TEST"],
    [],
    ["ĐƠN ĐẶT HÀNG"],
    ["Số PO: D08.26TEST1"],
    ["Ngày đặt hàng: 30/08/2026"],
    ["Ngày giao hàng: 07/09/2026"],
    [],
    ["Tên Khách Hàng", "", "", ":", "CÔNG TY TNHH TEST"],
    ["Địa chỉ khách hàng", "", "", ":", "123 Đường ABC, Hà Nội"],
    ["Mã Số Thuế", "", "", ":", ""],
    ["Người mua hàng", "", "", ":", ""],
    [],
    [],
    ["STT", "Mã hàng", "Mặt hàng", "", "", "", "", "", "Màu sắc", "", "Tên hàng viết HĐ", "Mô tả chi tiết", "", "", "Đvt", "Số lượng", "Đơn giá", "Thành tiền\r\nThực tế", "Dung sai", "Ghi Chú"],
    ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "Thực tế", "Thực tế"],
    ...itemRows,
    [],
    ["Tổng cộng:"],
    ...extraTailRows,
  ];
}

describe("parseManualOrderExcel", () => {
  it("đọc đúng thông tin đầu đơn + toàn bộ dòng mã hàng của file mẫu", () => {
    const buffer = makeOrderBuffer(
      baseRows([
        [1, "AA03.000162", "Thẻ tag 26004 V151", "", "", "", "", "", "", "", "", "Mô tả 1", "", "", "Cái", "27.600,0", 140, 3864000, "", "Ghi chú 1"],
        [2, "AA03.000163", "Thẻ tag 26004 V126", "", "", "", "", "", "", "", "", "Mô tả 2", "", "", "Cái", "15.000,", 140, 2100000, "", "Ghi chú 2"],
      ])
    );
    const result = parseManualOrderExcel(buffer);
    expect(result.orderCode).toBe("D08.26TEST1");
    expect(result.customerName).toBe("CÔNG TY TNHH TEST");
    expect(result.orderDate?.getFullYear()).toBe(2026);
    expect(result.orderDate?.getMonth()).toBe(7); // 0-indexed -> tháng 8
    expect(result.orderDate?.getDate()).toBe(30);
    expect(result.expectedDeliveryDate?.getDate()).toBe(7);
    expect(result.extra.customerAddress).toBe("123 Đường ABC, Hà Nội");
    expect(result.items).toHaveLength(2);
    // "27.600,0" (dấu . ngăn nghìn, dấu , thập phân kiểu VN) -> 27600
    expect(result.items[0]).toMatchObject({ itemCode: "AA03.000162", quantity: 27600, unitPrice: 140, totalPrice: 3864000 });
    // "15.000," (không có phần thập phân sau dấu phẩy) -> 15000
    expect(result.items[1]).toMatchObject({ itemCode: "AA03.000163", quantity: 15000, totalPrice: 2100000 });
    expect(result.totalValue).toBe(3864000 + 2100000);
  });

  it("tự tính Thành tiền = Số lượng × Đơn giá khi cột Thành tiền trống", () => {
    const buffer = makeOrderBuffer(
      baseRows([[1, "SP01", "Sản phẩm 1", "", "", "", "", "", "", "", "", "", "", "", "Cái", 10, 5000, "", "", ""]])
    );
    const result = parseManualOrderExcel(buffer);
    expect(result.items[0].totalPrice).toBe(50000);
    expect(result.totalValue).toBe(50000);
  });

  it("dùng Mã hàng làm Tên hàng khi Mặt hàng để trống", () => {
    const buffer = makeOrderBuffer(baseRows([[1, "SP01", "", "", "", "", "", "", "", "", "", "", "", "", "Cái", 10, 5000]]));
    const result = parseManualOrderExcel(buffer);
    expect(result.items[0].itemName).toBe("SP01");
  });

  it("dừng đọc bảng mã hàng đúng lúc gặp dòng 'Tổng cộng:' (không đọc lố)", () => {
    const buffer = makeOrderBuffer(
      baseRows([[1, "SP01", "Sản phẩm 1", "", "", "", "", "", "", "", "", "", "", "", "Cái", 10, 5000, 50000]])
    );
    const result = parseManualOrderExcel(buffer);
    expect(result.items).toHaveLength(1);
  });

  it("báo lỗi rõ ràng khi thiếu 'Số PO'", () => {
    const rows = baseRows([[1, "SP01", "Sản phẩm 1", "", "", "", "", "", "", "", "", "", "", "", "Cái", 10, 5000, 50000]]);
    rows[4] = []; // xoá dòng "Số PO: ..."
    const buffer = makeOrderBuffer(rows);
    expect(() => parseManualOrderExcel(buffer)).toThrow(ManualOrderParseError);
  });

  it("báo lỗi rõ ràng khi không có dòng mã hàng nào", () => {
    const buffer = makeOrderBuffer(baseRows([]));
    expect(() => parseManualOrderExcel(buffer)).toThrow(/Không đọc được dòng mã hàng/);
  });
});
