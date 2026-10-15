import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ customers: vi.fn(), lines: vi.fn(), users: vi.fn(), invoices: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    customer: { findMany: h.customers },
    poTrackingLine: { findMany: h.lines },
    user: { findMany: h.users },
    debtInvoice: { findMany: h.invoices },
  },
}));

import { getDormantCustomers, getDormantItems, getInvoiceOptions, getInvoiceRows } from "./stats-data";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const REF = d("2026-10-15");
const line = (o: Record<string, unknown>) => ({
  customerCode: "C.PANASONIC", poCode: "PO1", poDate: d("2026-08-01"), itemCode: "A1", itemName: "Hàng A1", unit: "Cái",
  poQuantity: 10, poValue: 1000, salesEmployeeId: "u1", ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.users.mockResolvedValue([{ id: "u1", name: "Tùng" }, { id: "u2", name: "Dung" }]);
  h.customers.mockResolvedValue([
    { customerCode: "PANASONIC", customerName: "Công ty Panasonic VN", salesEmployeeId: "u2" }, // tạo sớm nhất
    { customerCode: "C.PANASONIC", customerName: "Panasonic (bản trùng)", salesEmployeeId: "u1" },
  ]);
});

describe("getDormantCustomers", () => {
  it("lấy tên + NVKD từ danh sách Khách hàng (mã chuẩn hoá, trùng thì lấy bản tạo sớm nhất); khách chưa có trong danh sách dùng mã làm tên + NVKD trên dòng PO", async () => {
    h.lines.mockResolvedValue([
      line({}),
      line({ poCode: "PO2", poDate: d("2026-07-25"), itemCode: "B2", poValue: 500 }),
      line({ customerCode: "V.PRINTMAX", poDate: d("2026-08-03"), salesEmployeeId: "u1" }),
    ]);
    const rows = await getDormantCustomers({ isAdmin: true, userId: "admin" }, "2", REF);
    const pana = rows.find((r) => r.customerNorm === "PANASONIC")!;
    expect(pana).toMatchObject({ code: "PANASONIC", name: "Công ty Panasonic VN", ownerName: "Dung", inDirectory: true, poCount: 2, itemCount: 2, historyValue: 1500 });
    const pm = rows.find((r) => r.customerNorm === "PRINTMAX")!;
    expect(pm).toMatchObject({ code: "V.PRINTMAX", name: "V.PRINTMAX", ownerName: "Tùng", inDirectory: false });
  });

  it("NVKD chỉ thấy khách của mình; ADMIN lọc được theo NVKD", async () => {
    h.lines.mockResolvedValue([line({}), line({ customerCode: "V.PRINTMAX", poDate: d("2026-08-03"), salesEmployeeId: "u1" })]);
    const mine = await getDormantCustomers({ isAdmin: false, userId: "u2" }, "2", REF);
    expect(mine.map((r) => r.customerNorm)).toEqual(["PANASONIC"]); // NVKD của Panasonic là u2
    const asTung = await getDormantCustomers({ isAdmin: true, userId: "admin", employeeId: "u1" }, "2", REF);
    expect(asTung.map((r) => r.customerNorm)).toEqual(["PRINTMAX"]);
  });

  it("chỉ truy vấn PO từ 01/01/2026 có mã khách", async () => {
    h.lines.mockResolvedValue([]);
    await getDormantCustomers({ isAdmin: true, userId: "a" }, "2", REF);
    const where = h.lines.mock.calls[0][0].where;
    expect(where.poDate.gte.toISOString()).toBe("2025-12-31T17:00:00.000Z");
    expect(where.customerCode).toEqual({ not: null });
  });
});

describe("getDormantItems", () => {
  it("cặp khách + mã hàng, kèm tổng số lượng/doanh số 6 tháng", async () => {
    h.lines.mockResolvedValue([line({ itemCode: "B2", itemName: "Hàng B2", poQuantity: 5, poValue: 500 }), line({ itemCode: "B2", poCode: "PO0", poDate: d("2026-07-20"), poQuantity: 7, poValue: 700 })]);
    const rows = await getDormantItems({ isAdmin: true, userId: "a" }, "2", REF);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ code: "PANASONIC", itemCode: "B2", historyQty: 12, historyValue: 1200, poCount: 2 });
  });
});

describe("hoá đơn theo khách", () => {
  const inv = (o: Record<string, unknown>) => ({
    invoiceNumber: "0001", invoiceDate: d("2026-09-10"), dueDate: d("2026-10-10"), customerCode: "C.PANASONIC", customerName: "PANASONIC",
    originalAmount: 1000, paidAmount: 0, salesEmployee: { name: "Dung" }, allocations: [], ...o,
  });

  it("lọc khách theo mã chuẩn hoá (V.X / X như nhau), trạng thái đã/một phần/chưa, ngày thanh toán gần nhất", async () => {
    h.invoices.mockResolvedValue([
      inv({ invoiceNumber: "1", originalAmount: 1000, paidAmount: 1000, allocations: [{ payment: { paymentDate: d("2026-09-20") } }, { payment: { paymentDate: d("2026-09-25") } }] }),
      inv({ invoiceNumber: "2", customerCode: "PANASONIC", originalAmount: 1000, paidAmount: 400 }),
      inv({ invoiceNumber: "3", customerCode: "SAMSUNG", customerName: "SAMSUNG" }),
    ]);
    const rows = await getInvoiceRows({ isAdmin: true, userId: "a" }, { customer: "PANASONIC", month: "ALL" });
    expect(rows.map((r) => [r.invoiceNumber, r.status, r.remaining])).toEqual([["1", "PAID", 0], ["2", "PARTIAL", 600]]);
    expect(rows[0].customerName).toBe("Công ty Panasonic VN"); // tên theo danh sách Khách hàng
    expect(rows[0].lastPaymentDate).toEqual(d("2026-09-25"));
    expect((await getInvoiceRows({ isAdmin: true, userId: "a" }, { customer: "ALL", month: "ALL" })).length).toBe(3);
  });

  it("chọn tháng lọc theo ngày hoá đơn giờ VN; NVKD chỉ thấy hoá đơn của mình", async () => {
    h.invoices.mockResolvedValue([]);
    await getInvoiceRows({ isAdmin: false, userId: "u2" }, { customer: "ALL", month: "2026-09" });
    const where = h.invoices.mock.calls[0][0].where;
    expect(where.salesEmployeeId).toBe("u2");
    expect(where.invoiceDate.gte.toISOString()).toBe("2026-08-31T17:00:00.000Z");
    expect(where.invoiceDate.lt.toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });

  it("tuỳ chọn: gộp khách theo mã chuẩn hoá + danh sách tháng mới -> cũ", async () => {
    h.invoices.mockResolvedValue([
      { customerCode: "C.PANASONIC", customerName: "P", invoiceDate: d("2026-09-10") },
      { customerCode: "PANASONIC", customerName: "P", invoiceDate: d("2026-08-31") },
      { customerCode: "SAMSUNG", customerName: "Samsung", invoiceDate: d("2026-09-29") },
    ]);
    const o = await getInvoiceOptions({ isAdmin: true, userId: "a" });
    expect(o.customers.map((c) => [c.key, c.invoiceCount])).toEqual([["PANASONIC", 2], ["SAMSUNG", 1]].sort());
    expect(o.months).toEqual(["2026-09", "2026-08"]);
  });
});
