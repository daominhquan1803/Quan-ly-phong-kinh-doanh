import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ customers: vi.fn(), orders: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  prisma: { customer: { findMany: h.customers }, order: { findMany: h.orders } },
  normalizeCustomerCode: (s: string) => s.trim().toUpperCase().replace(/^[A-Z]\./, ""),
}));

import { getUnassignedCustomers } from "./customer-care-unassigned";

const NOW = new Date("2026-10-20T05:00:00Z");
const order = (code: string | null, name: string, emp: string | null, value: number, date: string) => ({
  customerCode: code,
  customerName: name,
  orderDate: new Date(date),
  totalValue: value,
  salesEmployeeId: emp,
  salesEmployee: emp ? { name: emp === "u1" ? "An" : "Bình" } : null,
});

describe("getUnassignedCustomers", () => {
  beforeEach(() => {
    h.customers.mockReset();
    h.orders.mockReset();
  });

  it("liệt kê hồ sơ chưa gán + khách có đơn nhưng chưa có hồ sơ; bỏ khách đã có người phụ trách; gợi ý NVKD nhiều đơn nhất", async () => {
    h.customers.mockResolvedValue([
      { id: "c1", customerCode: "KH1", customerName: "Khách 1", salesEmployeeId: "u1" }, // đã có người
      { id: "c2", customerCode: "KH2", customerName: "Khách 2", salesEmployeeId: null }, // chưa gán
      { id: "c3", customerCode: "KH3", customerName: "Khách 3", salesEmployeeId: null }, // chưa gán, không có đơn
    ]);
    h.orders.mockResolvedValue([
      order("KH1", "Khách 1", "u1", 100, "2026-10-01"),
      order("KH2", "Khách 2", "u2", 300, "2026-09-01"),
      order("KH2", "Khách 2", "u2", 200, "2026-10-10"),
      order("KH2", "Khách 2", "u1", 50, "2026-08-01"),
      order("C.UTECH", "UTECH VN", "u1", 133, "2026-10-11"), // chưa có hồ sơ
      order(null, "BLUECOM", "u1", 64, "2026-08-05"), // chưa có hồ sơ, thiếu mã
    ]);
    const rows = await getUnassignedCustomers(NOW);
    expect(rows.map((r) => r.customerName)).toEqual(["Khách 2", "UTECH VN", "BLUECOM", "Khách 3"]);
    const k2 = rows[0];
    expect(k2).toMatchObject({ customerId: "c2", orders12: 3, value12: 550, suggestedEmployeeId: "u2", suggestedEmployeeName: "Bình" });
    expect(rows[1]).toMatchObject({ customerId: null, customerCode: "UTECH", suggestedEmployeeName: "An" });
    expect(rows[2]).toMatchObject({ customerId: null, customerCode: null });
    expect(rows[3]).toMatchObject({ customerId: "c3", orders12: 0 });
  });
});
