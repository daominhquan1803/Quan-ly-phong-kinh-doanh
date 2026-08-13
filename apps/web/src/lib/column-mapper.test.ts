import { describe, it, expect } from "vitest";
import { hashHeaders, suggestMapping } from "./column-mapper";

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
});
