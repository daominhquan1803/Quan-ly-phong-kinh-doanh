import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ auth: vi.fn(), deleteMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({ prisma: { adminSatisfactionRating: { deleteMany: h.deleteMany } } }));

import { DELETE } from "./route";

const SYSTEM = { user: { id: "u-quan", role: "ADMIN", accessLevel: "FULL" } };
const OPERATOR = { user: { id: "u-ad", role: "ADMIN", accessLevel: "OPERATOR" } };
const SALES = { user: { id: "u-tung", role: "SALES", accessLevel: "FULL" } };
const del = (body: unknown) =>
  DELETE(new NextRequest("http://localhost/api/kpi-admin/ratings", { method: "DELETE", body: JSON.stringify(body), headers: { "content-type": "application/json" } }));

beforeEach(() => {
  vi.clearAllMocks();
  h.deleteMany.mockResolvedValue({ count: 1 });
});

describe("thu hồi đánh giá mức hài lòng", () => {
  it("NVKD thu hồi đánh giá của chính mình", async () => {
    h.auth.mockResolvedValue(SALES);
    const res = await del({ adminId: "u-ad", month: "2026-11" });
    expect(res.status).toBe(200);
    expect(h.deleteMany.mock.calls[0][0].where).toEqual({ adminId: "u-ad", raterId: "u-tung", year: 2026, month: 11 });
  });

  it("quản trị hệ thống thu hồi đánh giá của NVKD khác", async () => {
    h.auth.mockResolvedValue(SYSTEM);
    const res = await del({ adminId: "u-ad", month: "2026-11", raterId: "u-tung" });
    expect(res.status).toBe(200);
    expect(h.deleteMany.mock.calls[0][0].where.raterId).toBe("u-tung");
  });

  it("NVKD không thu hồi được đánh giá của người khác", async () => {
    h.auth.mockResolvedValue(SALES);
    const res = await del({ adminId: "u-ad", month: "2026-11", raterId: "u-dung" });
    expect(res.status).toBe(403);
    expect(h.deleteMany).not.toHaveBeenCalled();
  });

  it("Admin kinh doanh (không phải quản trị hệ thống) không thu hồi hộ được", async () => {
    h.auth.mockResolvedValue(OPERATOR);
    const res = await del({ adminId: "u-ad", month: "2026-11", raterId: "u-tung" });
    expect(res.status).toBe(403);
  });

  it("không có đánh giá thì báo 404", async () => {
    h.auth.mockResolvedValue(SALES);
    h.deleteMany.mockResolvedValue({ count: 0 });
    expect((await del({ adminId: "u-ad", month: "2026-11" })).status).toBe(404);
  });
});
