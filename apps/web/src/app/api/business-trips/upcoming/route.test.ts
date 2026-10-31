import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({ prisma: { businessTripRequest: { findMany: h.findMany } }, Prisma: {} }));

import { GET } from "./route";

const SALES = { user: { id: "u-tung", role: "SALES", accessLevel: "FULL" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(SALES);
  h.findMany.mockResolvedValue([
    { id: "t1", visitDate: new Date("2026-11-01T17:00:00Z"), status: "PENDING", provinces: ["Hưng Yên"], employee: { id: "u-tung", name: "Ngô Thanh Tùng" }, stops: [{ companyName: "Rise" }] },
  ]);
});

describe("chuyến công tác sắp đi (bảng thông báo chung)", () => {
  it("NVKD thường xem được; chỉ lấy chuyến chưa qua ngày đi và chưa bị từ chối", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const where = h.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ not: "REJECTED" });
    expect(where.visitDate.gte).toBeInstanceOf(Date);
    const json = await res.json();
    expect(json.trips[0]).toMatchObject({ id: "t1", provinces: ["Hưng Yên"], employee: { name: "Ngô Thanh Tùng" } });
  });
  it("chưa đăng nhập -> 401", async () => {
    h.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
