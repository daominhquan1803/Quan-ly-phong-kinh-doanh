import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/debt/[id]: NVKD chỉ được điền ngày dự kiến thanh toán LẦN ĐẦU,
// sau đó chỉ ADMIN sửa được (tránh tự đổi ngày để né trượt kế hoạch thu).

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  find: vi.fn(),
  update: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { debtInvoice: { findUnique: h.find, update: h.update } },
}));

import { PATCH } from "./route";

const patch = (body: unknown) =>
  PATCH(
    new NextRequest("http://test/api/debt/d1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id: "d1" } }
  );

const inv = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  salesEmployeeId: "u1",
  expectedPaymentDate: null,
  ...over,
});

describe("PATCH /api/debt/[id] — quyền sửa ngày dự kiến", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.update.mockResolvedValue({});
  });

  it("NVKD điền ngày lần đầu (đang trống) thì được", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.find.mockResolvedValue(inv());
    expect((await patch({ expectedPaymentDate: "2026-11-30" })).status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
  });

  it("NVKD gửi lại đúng ngày đang có thì không bị chặn oan", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.find.mockResolvedValue(inv({ expectedPaymentDate: new Date(2026, 10, 20) }));
    expect((await patch({ expectedPaymentDate: "2026-11-20" })).status).toBe(200);
  });

  it("NVKD đổi sang ngày khác hoặc xoá ngày đã điền thì bị chặn", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.find.mockResolvedValue(inv({ expectedPaymentDate: new Date(2026, 10, 20) }));
    expect((await patch({ expectedPaymentDate: "2026-12-05" })).status).toBe(403);
    expect((await patch({ expectedPaymentDate: null })).status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("ADMIN đổi ngày đã điền thì được", async () => {
    h.auth.mockResolvedValue({ user: { id: "admin", role: "ADMIN" } });
    h.find.mockResolvedValue(inv({ expectedPaymentDate: new Date(2026, 10, 20) }));
    const res = await patch({ expectedPaymentDate: "2026-12-05" });
    expect(res.status).toBe(200);
    expect(h.update).toHaveBeenCalledTimes(1);
  });
});
