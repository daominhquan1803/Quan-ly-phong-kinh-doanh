import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ invoices: vi.fn(), allocs: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    debtInvoice: { findMany: h.invoices },
    debtPaymentAllocation: { findMany: h.allocs },
  },
}));

import { getDebtSnapshot, getCollectionPlan } from "./debt-snapshot";

// Ngày lưu = 0h giờ VN quy ra UTC.
const vn = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const inv = (o: Partial<Record<string, unknown>>) => ({
  id: "i1",
  invoiceNumber: "HD1",
  customerCode: "KH1",
  customerName: "Khách 1",
  invoiceDate: vn("2026-08-01"),
  originalAmount: 1000,
  paidAmount: 0,
  dueDate: vn("2026-09-30"),
  expectedPaymentDate: null,
  salesEmployeeId: "u1",
  salesEmployee: { name: "Tùng" },
  ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.allocs.mockResolvedValue([]);
});

describe("getDebtSnapshot", () => {
  it("xem hiện tại: dùng paidAmount; quá hạn + chưa có lịch thanh toán được đếm đúng", async () => {
    h.invoices.mockResolvedValue([
      inv({ id: "a", dueDate: vn("2020-01-01"), originalAmount: 1000, paidAmount: 400 }),
      inv({ id: "b", dueDate: null, originalAmount: 500, expectedPaymentDate: vn("2026-10-20") }),
      inv({ id: "c", dueDate: vn("2020-01-01"), originalAmount: 200, paidAmount: 200 }),
    ]);
    const s = await getDebtSnapshot({ where: {}, asOfDate: null });
    expect(s.totalDebt).toBe(1100); // 600 + 500 + 0
    expect(s.overdueDebt).toBe(600);
    expect(s.noDueDebt).toBe(500);
    expect(s.openInvoiceCount).toBe(2);
    expect(s.noScheduleCount).toBe(1); // a còn nợ + không có ngày dự kiến; c đã trả đủ không tính
    expect(s.noScheduleAmount).toBe(600);
    expect(s.perEmployee.get("u1")!.overdueDebt).toBe(600);
  });

  it("xem tại 30/09 chốt cuối ngày: hạn đúng 30/09 mà chưa thu = quá hạn", async () => {
    h.invoices.mockResolvedValue([inv({ dueDate: vn("2026-09-30"), originalAmount: 1000 })]);
    const s = await getDebtSnapshot({ where: {}, asOfDate: vn("2026-09-30") });
    expect(s.overdueDebt).toBe(1000);
  });

  it("xem tại ngày: bỏ hoá đơn chứng từ sau ngày xem; đã thu = phần file gốc + tiền về có ngày <= ngày xem", async () => {
    h.invoices.mockResolvedValue([
      inv({ id: "late", invoiceDate: vn("2026-10-02"), originalAmount: 999 }),
      inv({ id: "x", originalAmount: 1000, paidAmount: 700 }), // 700 = 200 file gốc + 300 trước + 200 sau ngày xem
    ]);
    h.allocs.mockResolvedValue([
      { invoiceId: "x", amount: 300, payment: { paymentDate: vn("2026-09-15") } },
      { invoiceId: "x", amount: 200, payment: { paymentDate: vn("2026-10-01") } },
    ]);
    const s = await getDebtSnapshot({ where: {}, asOfDate: vn("2026-09-30") });
    expect(s.totalOriginal).toBe(1000);
    expect(s.totalPaid).toBe(500); // 200 (không có allocation) + 300
    expect(s.totalDebt).toBe(500);
  });

  it("withOverdueInvoices: liệt kê hoá đơn quá hạn, nhiều ngày quá hạn nhất đứng trước", async () => {
    h.invoices.mockResolvedValue([
      inv({ id: "a", invoiceNumber: "A", dueDate: vn("2026-09-20") }),
      inv({ id: "b", invoiceNumber: "B", dueDate: vn("2026-08-01") }),
      inv({ id: "c", invoiceNumber: "C", dueDate: vn("2099-01-01") }),
    ]);
    const s = await getDebtSnapshot({ where: {}, asOfDate: null, withOverdueInvoices: true });
    expect(s.overdueInvoices.map((i) => i.invoiceNumber)).toEqual(["B", "A"]);
    const empty = await getDebtSnapshot({ where: {}, asOfDate: null });
    expect(empty.overdueInvoices).toEqual([]);
  });
});

describe("getCollectionPlan", () => {
  it("kế hoạch theo ngày dự kiến, đã thu theo ngày tiền về thật, tách theo nhân viên; end loại trừ", async () => {
    const buckets = [
      { start: vn("2026-10-01"), end: vn("2026-10-08") },
      { start: vn("2026-10-08"), end: vn("2026-10-15") },
    ];
    h.invoices.mockResolvedValue([
      { originalAmount: 1000, expectedPaymentDate: vn("2026-10-07"), salesEmployeeId: "u1" },
      { originalAmount: 500, expectedPaymentDate: vn("2026-10-08"), salesEmployeeId: "u1" },
      { originalAmount: 300, expectedPaymentDate: vn("2026-10-09"), salesEmployeeId: null },
      { originalAmount: 700, expectedPaymentDate: null, salesEmployeeId: "u1" },
    ]);
    h.allocs.mockResolvedValue([
      { amount: 400, invoice: { salesEmployeeId: "u1" }, payment: { paymentDate: vn("2026-10-03") } },
      { amount: 100, invoice: { salesEmployeeId: "u1" }, payment: { paymentDate: vn("2026-10-20") } },
    ]);
    const plan = await getCollectionPlan({}, buckets);
    expect(plan.get("u1")).toEqual({ planned: [1000, 500], collected: [400, 0] });
    expect(plan.get("")).toEqual({ planned: [0, 300], collected: [0, 0] });
  });
});
