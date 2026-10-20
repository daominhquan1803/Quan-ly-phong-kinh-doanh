import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ customers: vi.fn(), orders: vi.fn(), invoices: vi.fn(), plan: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  prisma: { customer: { findMany: h.customers }, order: { findMany: h.orders }, debtInvoice: { findMany: h.invoices } },
  normalizeCustomerCode: (s: string) => s.trim().toUpperCase().replace(/^[A-Z]\./, ""),
}));
vi.mock("./customer-care-plan", () => ({ loadCarePlan: h.plan }));

import { getOwnedCustomers } from "./customer-care-transfer";

describe("getOwnedCustomers", () => {
  beforeEach(() => Object.values(h).forEach((f) => f.mockReset()));

  it("gộp đơn 12 tháng, hạng trong lịch và công nợ còn lại cho từng khách; sắp theo doanh số", async () => {
    h.customers.mockResolvedValue([
      { id: "c1", customerCode: "KH1", customerName: "Khách 1", buyingPattern: "REGULAR" },
      { id: "c2", customerCode: "KH2", customerName: "Khách 2", buyingPattern: "REGULAR" },
      { id: "c3", customerCode: "KH3", customerName: "Khách 3", buyingPattern: "SEASONAL" },
    ]);
    h.orders.mockResolvedValue([
      { customerCode: "C.KH1", customerName: "Khách 1", orderDate: new Date("2026-10-01"), totalValue: 100 },
      { customerCode: "KH1", customerName: "Khách 1", orderDate: new Date("2026-09-01"), totalValue: 50 },
      { customerCode: null, customerName: "khách 2", orderDate: new Date("2026-08-01"), totalValue: 500 },
      { customerCode: "KH9", customerName: "Khách ngoài", orderDate: new Date("2026-08-01"), totalValue: 999 },
    ]);
    h.plan.mockResolvedValue({ customers: [{ id: "c1", tier: "A" }] });
    h.invoices.mockResolvedValue([
      { customerCode: "KH1", originalAmount: 1000, paidAmount: 400 },
      { customerCode: "KH1", originalAmount: 200, paidAmount: 200 },
    ]);
    const rows = await getOwnedCustomers("boss", new Date("2026-10-20T05:00:00Z"));
    expect(rows.map((r) => r.id)).toEqual(["c2", "c1", "c3"]);
    expect(rows[1]).toMatchObject({ orders12: 2, value12: 150, tier: "A", unpaidDebt: 600 });
    expect(rows[0]).toMatchObject({ orders12: 1, value12: 500, tier: null }); // khớp theo tên khi đơn thiếu mã
    expect(rows[2]).toMatchObject({ orders12: 0, tier: null, pattern: "SEASONAL" });
    expect(h.plan).toHaveBeenCalledWith({ onlyEmployeeId: "boss" }, expect.any(Date));
  });
});
