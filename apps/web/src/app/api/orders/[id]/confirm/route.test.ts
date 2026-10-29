import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  ForbiddenError: class ForbiddenError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireAdmin: vi.fn(),
  orderFind: vi.fn(),
  confirmCreate: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({ requireAdmin: h.requireAdmin, ForbiddenError: h.ForbiddenError, UnauthorizedError: h.UnauthorizedError }));
vi.mock("@hoanggia/db", () => ({ prisma: { order: { findUnique: h.orderFind }, orderConfirmation: { create: h.confirmCreate } } }));

import { POST } from "./route";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const call = (files: File[]) => {
  const fd = new FormData();
  files.forEach((f) => fd.append("file", f));
  return POST(new Request("http://x/api/orders/o1/confirm", { method: "POST", body: fd }) as never, { params: { id: "o1" } });
};
const img = (name = "a.jpg") => new File([JPEG], name, { type: "image/jpeg" });

describe("POST /api/orders/[id]/confirm", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => typeof f === "function" && "mockReset" in f && (f as { mockReset: () => void }).mockReset());
    h.requireAdmin.mockResolvedValue({ user: { id: "admin1", role: "ADMIN", accessLevel: "OPERATOR" } });
    h.orderFind.mockResolvedValue({ id: "o1", confirmation: null });
    h.confirmCreate.mockResolvedValue({ id: "c1", confirmedAt: new Date(), photos: [{ id: "p1" }] });
  });

  it("bắt buộc có ảnh", async () => {
    const res = await call([]);
    expect(res.status).toBe(400);
    expect(h.confirmCreate).not.toHaveBeenCalled();
  });
  it("tài khoản chỉ xem không xác nhận được", async () => {
    h.requireAdmin.mockResolvedValue({ user: { id: "v", role: "ADMIN", accessLevel: "VIEWER" } });
    expect((await call([img()])).status).toBe(403);
  });
  it("file không phải ảnh bị từ chối", async () => {
    const res = await call([new File([new Uint8Array([1, 2, 3, 4])], "x.jpg", { type: "image/jpeg" })]);
    expect(res.status).toBe(400);
  });
  it("đơn đã xác nhận thì không xác nhận lại (409)", async () => {
    h.orderFind.mockResolvedValue({ id: "o1", confirmation: { id: "c0" } });
    expect((await call([img()])).status).toBe(409);
  });
  it("lưu xác nhận với người bấm là tài khoản đăng nhập, tối đa 3 ảnh", async () => {
    expect((await call([img(), img("b.jpg"), img("c.jpg"), img("d.jpg")])).status).toBe(400);
    const res = await call([img(), img("b.jpg")]);
    expect(res.status).toBe(201);
    const data = h.confirmCreate.mock.calls[0][0].data;
    expect(data.confirmedById).toBe("admin1");
    expect(data.photos.create).toHaveLength(2);
  });
});
