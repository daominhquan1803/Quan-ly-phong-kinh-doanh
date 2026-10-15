import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// GET /api/reports/stats: kiểm tra tham số, phân quyền (NVKD chỉ phạm vi mình), JSON xem trước và file xlsx.

const h = vi.hoisted(() => ({ auth: vi.fn(), dormantC: vi.fn(), dormantI: vi.fn(), invRows: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/stats-data", () => ({ getDormantCustomers: h.dormantC, getDormantItems: h.dormantI, getInvoiceRows: h.invRows }));

import { GET } from "./route";

const get = (qs: string) => GET(new NextRequest(`http://localhost/api/reports/stats?${qs}`));
const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);

const CUSTOMER = {
  customerNorm: "PANASONIC", customerCode: "C.PANASONIC", code: "PANASONIC", name: "Panasonic", ownerName: "Dung", inDirectory: true,
  lastPoDate: d("2026-08-01"), daysSince: 75, monthsSince: 2, lastSalesEmployeeId: "u2", truncated: false, poCount: 1, itemCount: 1, historyValue: 1000,
  history: [{ customerNorm: "PANASONIC", customerCode: "C.PANASONIC", poDate: d("2026-08-01"), poCode: "PO1", itemCode: "A1", itemName: "Hàng A1", unit: "Cái", qty: 10, value: 1000 }],
};
const INVOICE = {
  invoiceNumber: "0001", invoiceDate: d("2026-09-10"), dueDate: d("2026-10-10"), customerCode: "PANASONIC", customerName: "Panasonic", ownerName: "Dung",
  total: 1000, paid: 400, remaining: 600, status: "PARTIAL", lastPaymentDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
  h.dormantC.mockResolvedValue([CUSTOMER]);
  h.dormantI.mockResolvedValue([]);
  h.invRows.mockResolvedValue([INVOICE]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/reports/stats", () => {
  it("xem trước khách lâu chưa mua: số lượng + dòng mẫu, truyền đúng mốc và phạm vi", async () => {
    const res = await get("kind=dormant-customers&bucket=3");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toMatchObject({ kind: "dormant-customers", count: 1 });
    expect(json.sample[0]).toMatchObject({ code: "PANASONIC", name: "Panasonic", monthsSince: 2 });
    expect(h.dormantC.mock.calls[0][0]).toEqual({ isAdmin: true, userId: "admin1", employeeId: undefined });
    expect(h.dormantC.mock.calls[0][1]).toBe("3");
  });

  it("NVKD: phạm vi chỉ của mình, bỏ qua employeeId gửi lên", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
    await get("kind=dormant-customers&bucket=2&employeeId=u-khac");
    expect(h.dormantC.mock.calls[0][0]).toEqual({ isAdmin: false, userId: "u-tung", employeeId: undefined });
  });

  it("ADMIN lọc theo NVKD", async () => {
    await get("kind=dormant-items&bucket=over3&employeeId=u2");
    expect(h.dormantI.mock.calls[0][0].employeeId).toBe("u2");
    expect(h.dormantI.mock.calls[0][1]).toBe("over3");
  });

  it("hoá đơn: chuẩn hoá mã khách, tổng + đếm trạng thái", async () => {
    const json = await (await get("kind=invoices&customer=C.PANASONIC&month=2026-09")).json();
    expect(h.invRows.mock.calls[0][1]).toEqual({ customer: "PANASONIC", month: "2026-09" });
    expect(json).toMatchObject({ count: 1, totals: { total: 1000, paid: 400, remaining: 600 }, counts: { paid: 0, partial: 1, unpaid: 0 } });
    expect(json.sample[0].status).toBe("Thanh toán một phần");
  });

  it("tải file xlsx: đúng content-type, tên file theo loại + mốc", async () => {
    const res = await get("kind=dormant-customers&bucket=2&format=xlsx");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
    expect(decodeURIComponent(res.headers.get("Content-Disposition") ?? "")).toMatch(/Khach-lau-chua-mua_2-thang_\d{4}-\d{2}-\d{2}\.xlsx/);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(1000);
  });

  it("THẤT BẠI: loại/mốc/tháng sai -> 400, không truy vấn", async () => {
    for (const qs of ["", "kind=abc", "kind=dormant-customers&bucket=9", "kind=invoices&month=2026-13", "kind=invoices&month=thang9"]) {
      expect((await get(qs)).status).toBe(400);
    }
    expect(h.dormantC).not.toHaveBeenCalled();
    expect(h.invRows).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập -> 401", async () => {
    h.auth.mockResolvedValue(null);
    expect((await get("kind=dormant-customers&bucket=2")).status).toBe(401);
  });
});
