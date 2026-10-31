import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  tripFind: vi.fn(),
  customerFind: vi.fn(),
  customerUpdate: vi.fn(),
  userFind: vi.fn(),
  stopCreate: vi.fn(),
  notifCreate: vi.fn(),
  addr: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    businessTripRequest: { findUnique: h.tripFind },
    customer: { findUnique: h.customerFind, update: h.customerUpdate },
    user: { findFirst: h.userFind },
    businessTripStop: { create: h.stopCreate },
    notification: { create: h.notifCreate },
    $transaction: async (cb: (tx: unknown) => unknown) => cb({ customer: { update: h.customerUpdate }, businessTripStop: { create: h.stopCreate } }),
  },
}));
vi.mock("@/lib/customer-address", () => ({ effectiveAddresses: h.addr }));

import { POST } from "./route";

const DUNG = { user: { id: "dung", name: "Phạm Thị Dung", role: "SALES", accessLevel: "FULL" } };
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: { id: "t1" } });
const future = new Date(Date.now() + 3 * 86400000);

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(DUNG);
  h.tripFind.mockResolvedValue({ id: "t1", employeeId: "tung", status: "PENDING", visitDate: future, provinces: ["Bắc Ninh"], employee: { name: "Ngô Thanh Tùng" }, stops: [{ orderIndex: 1, customerId: null, companyName: "Cty khác" }] });
  h.customerFind.mockResolvedValue({ id: "c1", customerCode: "KH1", customerName: "CÔNG TY TNHH HABOK", address: null, salesEmployeeId: "dung" });
  h.addr.mockResolvedValue(new Map([["c1", "KCN Quế Võ, Bắc Ninh"]]));
  h.userFind.mockResolvedValue({ id: "dung" });
  h.stopCreate.mockResolvedValue({ id: "s2" });
});

describe("thêm khách vào chuyến công tác", () => {
  it("chủ khách tự tham gia: tạo điểm dừng, người đi gặp = mình, địa chỉ lấy theo hồ sơ/AMIS, báo người đăng ký chuyến", async () => {
    const res = await call({ customerId: "c1" });
    expect(res.status).toBe(201);
    expect(h.stopCreate.mock.calls[0][0].data).toMatchObject({ tripId: "t1", orderIndex: 2, customerId: "c1", attendeeId: "dung", addedById: "dung", address: "KCN Quế Võ, Bắc Ninh", companyName: "CÔNG TY TNHH HABOK" });
    expect(h.customerUpdate).not.toHaveBeenCalled();
    const to = h.notifCreate.mock.calls.map((c) => c[0].data.userId);
    expect(to).toEqual(["tung"]);
  });
  it("khách chưa phân: người bấm nhận thì khách được gán cho họ", async () => {
    h.customerFind.mockResolvedValue({ id: "c1", customerCode: "KH1", customerName: "Cty Mới", address: null, salesEmployeeId: null });
    expect((await call({ customerId: "c1" })).status).toBe(201);
    expect(h.customerUpdate).toHaveBeenCalledWith({ where: { id: "c1" }, data: { salesEmployeeId: "dung" } });
  });
  it("nhờ đi hộ: người đi gặp là người được nhờ, người đó được báo", async () => {
    h.userFind.mockResolvedValue({ id: "ky" });
    expect((await call({ customerId: "c1", attendeeId: "ky" })).status).toBe(201);
    expect(h.stopCreate.mock.calls[0][0].data.attendeeId).toBe("ky");
    expect(h.notifCreate.mock.calls.map((c) => c[0].data.userId).sort()).toEqual(["ky", "tung"]);
  });
  it("THẤT BẠI: không có quyền -> 403; khách đã có trong chuyến -> 409; chuyến đã qua ngày / đã báo cáo -> 400", async () => {
    h.customerFind.mockResolvedValue({ id: "c1", customerCode: "KH1", customerName: "Cty X", address: null, salesEmployeeId: "ky" });
    expect((await call({ customerId: "c1" })).status).toBe(403);
    h.customerFind.mockResolvedValue({ id: "c1", customerCode: "KH1", customerName: "Cty khác", address: null, salesEmployeeId: "dung" });
    expect((await call({ customerId: "c1" })).status).toBe(409);
    h.customerFind.mockResolvedValue({ id: "c1", customerCode: "KH1", customerName: "CÔNG TY TNHH HABOK", address: null, salesEmployeeId: "dung" });
    h.tripFind.mockResolvedValue({ id: "t1", employeeId: "tung", status: "REPORTED", visitDate: future, provinces: [], employee: { name: "T" }, stops: [] });
    expect((await call({ customerId: "c1" })).status).toBe(400);
    h.tripFind.mockResolvedValue({ id: "t1", employeeId: "tung", status: "PENDING", visitDate: new Date("2020-01-01"), provinces: [], employee: { name: "T" }, stops: [] });
    expect((await call({ customerId: "c1" })).status).toBe(400);
    expect(h.stopCreate).not.toHaveBeenCalled();
  });
});
