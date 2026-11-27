import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn(), careUpdateMany: vi.fn(), tx: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/customer-invoice-sync", () => ({ assignCustomerToUnassignedInvoices: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  normalizeCustomerCode: (s: string) => s,
  prisma: {
    customer: { findMany: h.findMany, update: h.update, updateMany: h.updateMany },
    customerCareLog: { updateMany: h.careUpdateMany },
    businessTripStop: { updateMany: vi.fn() },
    customerStageHistory: { updateMany: vi.fn() },
    $transaction: h.tx,
  },
}));

import { POST } from "./route";

const post = (body: unknown) => POST(new NextRequest("http://localhost/api/customers/merge", { method: "POST", body: JSON.stringify(body) }));
const row = (id: string, extra: object = {}) => ({ id, customerCode: id.toUpperCase(), mergedIntoId: null, lockedAt: null, ...extra });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN", accessLevel: "FULL" } });
  h.findMany.mockResolvedValue([row("a"), row("b", { address: "Bắc Ninh" })]);
  h.tx.mockResolvedValue([{ count: 2 }]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/customers/merge", () => {
  it("chuyển lịch sử sang mã chính, đánh dấu mã phụ, điền ô trống", async () => {
    const res = await post({ primaryId: "a", secondaryIds: ["b"] });
    expect(await res.json()).toEqual({ merged: 1, careLogsMoved: 2 });
    expect(h.careUpdateMany).toHaveBeenCalledWith({ where: { customerId: { in: ["b"] } }, data: { customerId: "a" } });
    expect(h.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["b"] } }, data: { mergedIntoId: "a", lockedAt: null } });
    expect(h.update).toHaveBeenCalledWith({ where: { id: "a" }, data: { address: "Bắc Ninh" } });
  });

  it("THẤT BẠI: NVKD và ADMIN không phải mức FULL -> 403, không ghi", async () => {
    for (const user of [{ id: "u1", role: "SALES" }, { id: "u2", role: "ADMIN", accessLevel: "OPERATOR" }]) {
      h.auth.mockResolvedValue({ user });
      expect((await post({ primaryId: "a", secondaryIds: ["b"] })).status).toBe(403);
    }
    expect(h.tx).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: gộp vào chính nó, mã chính đang khoá, mã phụ đã gộp -> 400", async () => {
    expect((await post({ primaryId: "a", secondaryIds: ["a"] })).status).toBe(400);
    h.findMany.mockResolvedValue([row("a", { lockedAt: new Date() }), row("b")]);
    expect((await post({ primaryId: "a", secondaryIds: ["b"] })).status).toBe(400);
    h.findMany.mockResolvedValue([row("a"), row("b", { mergedIntoId: "c" })]);
    expect((await post({ primaryId: "a", secondaryIds: ["b"] })).status).toBe(400);
    expect(h.tx).not.toHaveBeenCalled();
  });
});
