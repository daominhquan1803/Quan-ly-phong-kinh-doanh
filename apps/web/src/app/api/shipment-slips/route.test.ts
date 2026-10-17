import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// GET /api/shipment-slips và /api/shipment-slips/[id]: mọi người dùng đăng nhập (kể cả NVKD) xem + tìm được toàn bộ phiếu.
const h = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({ prisma: { shipmentSlip: { findMany: h.findMany, findUnique: h.findUnique } } }));

import { GET as LIST } from "./route";
import { GET as DETAIL } from "./[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
  h.findMany.mockResolvedValue([]);
});

describe("quyền xem phiếu đi hàng", () => {
  it("NVKD xem danh sách: không bị lọc theo người lập phiếu, tìm được theo từ khoá", async () => {
    const res = await LIST(new NextRequest("http://localhost/api/shipment-slips?q=panasonic"));
    expect(res.status).toBe(200);
    const where = h.findMany.mock.calls[0][0].where;
    expect(where.createdById).toBeUndefined();
    expect(where.OR).toBeTruthy(); // điều kiện tìm (số phiếu / khách / đơn / dòng hàng)
  });

  it("NVKD mở chi tiết phiếu do admin lập: được xem", async () => {
    h.findUnique.mockResolvedValue({ id: "s1", slipNumber: "PX1", createdById: "u-admin", items: [] });
    const res = await DETAIL(new NextRequest("http://localhost/api/shipment-slips/s1"), { params: { id: "s1" } });
    expect(res.status).toBe(200);
    expect((await res.json()).slip.slipNumber).toBe("PX1");
  });

  it("chưa đăng nhập -> 401; phiếu không tồn tại -> 404", async () => {
    h.auth.mockResolvedValue(null);
    expect((await LIST(new NextRequest("http://localhost/api/shipment-slips"))).status).toBe(401);
    expect((await DETAIL(new NextRequest("http://localhost/api/shipment-slips/x"), { params: { id: "x" } })).status).toBe(401);
    h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
    h.findUnique.mockResolvedValue(null);
    expect((await DETAIL(new NextRequest("http://localhost/api/shipment-slips/x"), { params: { id: "x" } })).status).toBe(404);
  });
});
