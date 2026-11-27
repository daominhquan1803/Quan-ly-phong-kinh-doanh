import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", () => ({ prisma: {}, normalizeCustomerCode: (s: string) => s }));

import { duplicateGroups, mergeFill } from "./customer-merge";

describe("duplicateGroups", () => {
  it("gom theo tên đã bỏ dấu và từ loại hình; tên chỉ có 1 hồ sơ thì bỏ", () => {
    const groups = duplicateGroups([
      { customerName: "CÔNG TY TNHH LT VIỆT PHÁT" },
      { customerName: "Công ty TNHH LT Việt Phát" },
      { customerName: "CÔNG TY TNHH NAM SƠN" },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });
});

describe("mergeFill", () => {
  const primary = { address: "Hà Nội", contactPhone: null, industry: "", salesEmployeeId: null, stage: null };

  it("chỉ điền ô trống của hồ sơ chính, lấy giá trị đầu tiên có trong các hồ sơ phụ", () => {
    const fill = mergeFill(primary, [
      { address: "Bắc Ninh", contactPhone: null, industry: "DIEN_TU", salesEmployeeId: "u1", stage: null },
      { address: null, contactPhone: "0900", industry: "KHAC", salesEmployeeId: "u2", stage: null },
    ]);
    expect(fill).toEqual({ contactPhone: "0900", industry: "DIEN_TU", salesEmployeeId: "u1" });
  });

  it("không chép email và thời hạn công nợ (ảnh hưởng thư gửi khách và hạn nợ)", () => {
    const fill = mergeFill({}, [{ email: "a@x.com", paymentTermType: "DAYS_FROM_INVOICE", paymentTermDays: 30 }]);
    expect(fill).toEqual({});
  });
});
