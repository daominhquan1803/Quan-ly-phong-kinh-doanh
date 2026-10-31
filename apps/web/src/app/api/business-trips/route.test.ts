import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// POST /api/business-trips: người đi gặp + người hỗ trợ theo từng điểm dừng, thông báo cho người được chọn.

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  userFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  customerFindMany: vi.fn(),
  tripCreate: vi.fn(),
  notifCreate: vi.fn(),
  locked: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    user: { findMany: h.userFindMany, findFirst: h.userFindFirst },
    customer: { findMany: h.customerFindMany },
    businessTripRequest: { create: h.tripCreate },
    notification: { create: h.notifCreate },
  },
}));
vi.mock("@/lib/week-plan", () => ({ isWeekEntryLocked: h.locked, snapToWeekStart: (d: Date) => d, weekLockedMessage: () => "Tuần này đã khoá" }));

import { POST } from "./route";

const TUNG = { user: { id: "tung", name: "Ngô Thanh Tùng", role: "SALES", accessLevel: "FULL" } };
const post = (body: unknown) =>
  POST(new NextRequest("http://localhost/api/business-trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const stop = (o: object = {}) => ({ companyName: "Cty A", address: "Hưng Yên", expectedTime: "09:00", content: "Gặp bàn đơn hàng quý 4", ...o });
const base = { visitDate: "2026-11-02", provinces: ["Hưng Yên"] };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(TUNG);
  h.locked.mockReturnValue(false);
  h.userFindMany.mockImplementation(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id })));
  h.customerFindMany.mockResolvedValue([{ id: "c1" }]);
  h.tripCreate.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "t1", ...(data as object) }));
});

describe("đăng ký công tác: người đi gặp và người hỗ trợ theo điểm dừng", () => {
  it("mặc định người đi gặp = người đăng ký; lưu khách, người thêm", async () => {
    const res = await post({ ...base, stops: [stop({ customerId: "c1" })] });
    expect(res.status).toBe(201);
    const s = h.tripCreate.mock.calls[0][0].data.stops.create[0];
    expect(s).toMatchObject({ attendeeId: "tung", customerId: "c1", addedById: "tung", orderIndex: 1 });
    expect(h.notifCreate).not.toHaveBeenCalled();
  });
  it("ví dụ Tùng đăng ký cho Dung: khách 2 do Dung đi, Tùng hỗ trợ — Dung được báo", async () => {
    const res = await post({ ...base, stops: [stop({ companyName: "Khách của Tùng" }), stop({ companyName: "Khách của Dung", attendeeId: "dung", supporterEmployeeIds: ["tung"] })] });
    expect(res.status).toBe(201);
    const stops = h.tripCreate.mock.calls[0][0].data.stops.create;
    expect(stops[1]).toMatchObject({ attendeeId: "dung", supporters: { create: [{ employeeId: "tung" }] } });
    expect(h.notifCreate).toHaveBeenCalledTimes(1);
    expect(h.notifCreate.mock.calls[0][0].data).toMatchObject({ userId: "dung", type: "TRIP_ASSIGNED" });
    expect(h.notifCreate.mock.calls[0][0].data.message).toContain("Khách của Dung");
  });
  it("mỗi người chỉ nhận 1 thông báo dù được xếp nhiều điểm dừng", async () => {
    await post({ ...base, stops: [stop({ attendeeId: "dung" }), stop({ attendeeId: "dung" }), stop({ attendeeId: "ky", supporterEmployeeIds: ["dung"] })] });
    const to = h.notifCreate.mock.calls.map((c) => c[0].data.userId).sort();
    expect(to).toEqual(["dung", "ky"]);
  });
  it("THẤT BẠI: người đi gặp / hỗ trợ / khách không hợp lệ -> 400, không tạo", async () => {
    h.userFindMany.mockResolvedValue([]); // không ai hợp lệ
    expect((await post({ ...base, stops: [stop({ attendeeId: "ghost" })] })).status).toBe(400);
    expect((await post({ ...base, stops: [stop({ supporterEmployeeIds: ["ghost"] })] })).status).toBe(400);
    h.customerFindMany.mockResolvedValue([]);
    expect((await post({ ...base, stops: [stop({ customerId: "zzz" })] })).status).toBe(400);
    expect(h.tripCreate).not.toHaveBeenCalled();
  });
});
