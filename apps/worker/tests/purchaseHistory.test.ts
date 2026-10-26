import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", () => ({
  prisma: {},
  OrderStatus: {},
  normalizeVN: (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim(),
  isSampleOrder: (o: { sale_order_name?: string | null }) => /hàng mẫu/i.test(o.sale_order_name ?? ""),
  isSampleMapping: () => false,
  resolveEmployeeIdByCode: vi.fn(),
  resolveEmployeeIdByName: vi.fn(),
  extractNameFromAmisLabel: vi.fn(),
  getManagedAmisEmployeeCodes: vi.fn(),
  syncPoTrackingFromOrders: vi.fn(),
}));
vi.mock("../src/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { collectPurchases } from "../src/sync/amis";

const o = (over: Record<string, unknown>) =>
  ({ id: 1, sale_order_no: "X", account_name: "CÔNG TY ABC", account_code: "ABC", sale_order_date: "2025-06-10T12:00:00Z", revenue_status: "Đã ghi", is_deleted: false, sale_order_name: null, ...over }) as never;

describe("collectPurchases — lịch sử mua để phân biệt khách mới / cũ", () => {
  it("lấy ngày mua gần nhất của từng khách, kể cả đơn trước 01/04/2026", () => {
    const m = collectPurchases([o({ sale_order_date: "2025-06-10T12:00:00Z" }), o({ sale_order_date: "2026-02-01T12:00:00Z" }), o({ sale_order_date: "2024-01-01T12:00:00Z" })]);
    expect(m.get("CÔNG TY ABC")?.at.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(m.get("CÔNG TY ABC")?.code).toBe("ABC");
  });
  it("bỏ đơn nháp/huỷ, đơn đã xoá, đơn hàng mẫu và đơn thiếu ngày/tên khách", () => {
    const m = collectPurchases([
      o({ revenue_status: "Bản nháp" }),
      o({ revenue_status: "Huỷ ghi" }),
      o({ is_deleted: true }),
      o({ sale_order_name: "Đơn hàng mẫu" }),
      o({ sale_order_date: null }),
      o({ account_name: null }),
    ]);
    expect(m.size).toBe(0);
  });
});
