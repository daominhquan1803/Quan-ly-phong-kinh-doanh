import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  ForbiddenError: class ForbiddenError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSystemAdmin: vi.fn(),
  userFirst: vi.fn(),
  customerFindMany: vi.fn(),
  customerUpdateMany: vi.fn(),
  debtUpdateMany: vi.fn(),
  notifCreate: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({ requireSystemAdmin: h.requireSystemAdmin, ForbiddenError: h.ForbiddenError, UnauthorizedError: h.UnauthorizedError }));
vi.mock("@/lib/customer-care-transfer", () => ({ getOwnedCustomers: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    user: { findFirst: h.userFirst, findMany: vi.fn() },
    customer: { findMany: h.customerFindMany, updateMany: h.customerUpdateMany },
    debtInvoice: { updateMany: h.debtUpdateMany },
    notification: { create: h.notifCreate },
  },
}));

import { POST } from "./route";

const call = (body: unknown) => POST(new Request("http://x/api/customer-care/transfer", { method: "POST", body: JSON.stringify(body) }) as never);
const reset = () => Object.values(h).forEach((f) => typeof f === "function" && "mockReset" in f && (f as { mockReset: () => void }).mockReset());

describe("POST /api/customer-care/transfer", () => {
  beforeEach(() => {
    reset();
    h.requireSystemAdmin.mockResolvedValue({ user: { id: "boss" } });
    h.userFirst.mockResolvedValue({ id: "u-tung", name: "Tùng" });
  });

  it("chỉ quản trị hệ thống được chuyển", async () => {
    h.requireSystemAdmin.mockRejectedValue(new h.ForbiddenError("Chỉ quản trị hệ thống"));
    expect((await call({ employeeId: "u-tung", customerIds: ["c1"] })).status).toBe(403);
    expect(h.customerUpdateMany).not.toHaveBeenCalled();
  });

  it("chỉ chuyển khách đang đứng tên người chuyển; không ghi đè khách của NVKD khác; mặc định không đụng công nợ", async () => {
    h.customerFindMany.mockResolvedValue([{ id: "c1", customerCode: "KH1" }]); // c2 đang của người khác -> bị lọc
    h.customerUpdateMany.mockResolvedValue({ count: 1 });
    const res = await call({ employeeId: "u-tung", customerIds: ["c1", "c2"] });
    expect(await res.json()).toMatchObject({ transferred: 1, skipped: 1, debtMoved: 0 });
    expect(h.customerFindMany.mock.calls[0][0].where).toMatchObject({ salesEmployeeId: "boss" });
    expect(h.customerUpdateMany.mock.calls[0][0].where).toMatchObject({ salesEmployeeId: "boss" });
    expect(h.debtUpdateMany).not.toHaveBeenCalled();
    expect(h.notifCreate.mock.calls[0][0].data).toMatchObject({ userId: "u-tung", type: "CARE_DUE_DAILY" });
  });

  it("moveDebt: chuyển cả hoá đơn công nợ còn đứng tên người chuyển", async () => {
    h.customerFindMany.mockResolvedValue([{ id: "c1", customerCode: "KH1" }]);
    h.customerUpdateMany.mockResolvedValue({ count: 1 });
    h.debtUpdateMany.mockResolvedValue({ count: 4 });
    const res = await call({ employeeId: "u-tung", customerIds: ["c1"], moveDebt: true });
    expect((await res.json()).debtMoved).toBe(4);
    expect(h.debtUpdateMany.mock.calls[0][0]).toMatchObject({ where: { customerCode: { in: ["KH1"] }, salesEmployeeId: "boss" }, data: { salesEmployeeId: "u-tung" } });
  });

  it("từ chối: tự chuyển cho mình, người nhận không phải NVKD hoạt động, không có khách của mình trong danh sách", async () => {
    expect((await call({ employeeId: "boss", customerIds: ["c1"] })).status).toBe(400);
    h.userFirst.mockResolvedValue(null);
    expect((await call({ employeeId: "x", customerIds: ["c1"] })).status).toBe(400);
    h.userFirst.mockResolvedValue({ id: "u-tung", name: "Tùng" });
    h.customerFindMany.mockResolvedValue([]);
    expect((await call({ employeeId: "u-tung", customerIds: ["c9"] })).status).toBe(400);
    expect(h.customerUpdateMany).not.toHaveBeenCalled();
  });
});
