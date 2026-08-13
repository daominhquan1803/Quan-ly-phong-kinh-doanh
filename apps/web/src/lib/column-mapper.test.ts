import { describe, it, expect } from "vitest";
import { hashHeaders, suggestMapping } from "./column-mapper";
import { SALES_PLAN_FIELDS } from "./sales-plan-fields";

describe("hashHeaders", () => {
  it("produces the same hash regardless of header order", () => {
    const a = hashHeaders(["Mã đơn hàng", "Khách hàng", "Giá trị đơn hàng"]);
    const b = hashHeaders(["Khách hàng", "Giá trị đơn hàng", "Mã đơn hàng"]);
    expect(a).toBe(b);
  });

  it("produces the same hash regardless of accent/case differences", () => {
    const a = hashHeaders(["Mã Đơn Hàng"]);
    const b = hashHeaders(["ma don hang"]);
    expect(a).toBe(b);
  });

  it("produces a different hash for a different header set", () => {
    const a = hashHeaders(["Mã đơn hàng", "Khách hàng"]);
    const b = hashHeaders(["Mã đơn hàng", "Khách hàng", "Ghi chú"]);
    expect(a).not.toBe(b);
  });
});

describe("suggestMapping", () => {
  it("suggests the right column for known AMIS-style headers", () => {
    const mapping = suggestMapping([
      "Mã đơn hàng",
      "Khách hàng",
      "Nhân viên kinh doanh",
      "Ngày giao hàng",
      "Thành tiền",
    ]);
    expect(mapping.orderCode).toBe("Mã đơn hàng");
    expect(mapping.customerName).toBe("Khách hàng");
    expect(mapping.salesEmployeeNameRaw).toBe("Nhân viên kinh doanh");
    expect(mapping.expectedDeliveryDate).toBe("Ngày giao hàng");
    expect(mapping.totalValue).toBe("Thành tiền");
  });

  it("leaves a field unmapped when no header is a good match", () => {
    const mapping = suggestMapping(["Cột không liên quan"]);
    expect(mapping.orderCode).toBeUndefined();
  });

  it("never assigns the same column to two different fields", () => {
    const mapping = suggestMapping([
      "Mã đơn hàng",
      "Khách hàng",
      "Nhân viên kinh doanh",
      "Ngày đặt hàng",
      "Ngày giao hàng",
      "Thành tiền",
    ]);
    const assignedHeaders = Object.values(mapping);
    expect(new Set(assignedHeaders).size).toBe(assignedHeaders.length);
    // "Ngày giao hàng" là khớp chính xác (synonym) của expectedDeliveryDate, không phải
    // orderDate — dù "Ngày đặt hàng" và "Ngày giao hàng" có nhiều từ chung.
    expect(mapping.expectedDeliveryDate).toBe("Ngày giao hàng");
    expect(mapping.orderDate).toBe("Ngày đặt hàng");
  });

  it("supports a custom field list with its own exclusive assignment", () => {
    const mapping = suggestMapping(
      ["Nhân viên kinh doanh", "Mã sản phẩm", "Nhóm hàng", "Doanh số mục tiêu"],
      SALES_PLAN_FIELDS
    );
    expect(mapping.employeeName).toBe("Nhân viên kinh doanh");
    expect(mapping.productCode).toBe("Mã sản phẩm");
    expect(mapping.productGroup).toBe("Nhóm hàng");
    expect(mapping.targetRevenue).toBe("Doanh số mục tiêu");
    // Không có cột "Tên sản phẩm"/"Số lượng mục tiêu" thật — không được gán nhầm sang cột khác.
    expect(mapping.productName).toBeUndefined();
    expect(mapping.targetQuantity).toBeUndefined();
  });
});
