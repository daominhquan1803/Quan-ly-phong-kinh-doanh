import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  ForbiddenError: class ForbiddenError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSystemAdmin: vi.fn(),
  userFirst: vi.fn(),
  customerFindMany: vi.fn(),
  customerUpdateMany: vi.fn(),
  customerFindUnique: vi.fn(),
  customerCreate: vi.fn(),
  customerUpdate: vi.fn(),
  notifCreate: vi.fn(),
  assignInvoices: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({ requireSystemAdmin: h.requireSystemAdmin, ForbiddenError: h.ForbiddenError, UnauthorizedError: h.UnauthorizedError }));
vi.mock("@/lib/customer-invoice-sync", () => ({ assignCustomerToUnassignedInvoices: h.assignInvoices }));
vi.mock("@hoanggia/db", () => ({
  normalizeCustomerCode: (s: string) => s.trim().toUpperCase().replace(/^[A-Z]\./, ""),
  prisma: {
    user: { findFirst: h.userFirst },
    customer: { findMany: h.customerFindMany, updateMany: h.customerUpdateMany, findUnique: h.customerFindUnique, create: h.customerCreate, update: h.customerUpdate },
    notification: { create: h.notifCreate },
  },
}));

import { POST } from "./route";

const call = (body: unknown) => POST(new Request("http://x/api/customer-care/assign", { method: "POST", body: JSON.stringify(body) }) as never);

describe("POST /api/customer-care/assign", () => {
  beforeEach(() => {
    Object.values(h).forEach((f) => typeof f === "function" && "mockReset" in f && (f as { mockReset: () => void }).mockReset());
    h.requireSystemAdmin.mockResolvedValue({ user: { id: "boss" } });
    h.userFirst.mockResolvedValue({ id: "u-tung", name: "Tùng" });
  });

  it("chỉ quản trị hệ thống được phân", async () => {
    h.requireSystemAdmin.mockRejectedValue(new h.ForbiddenError("Chỉ quản trị hệ thống"));
    const res = await call({ employeeId: "u-tung", customerIds: ["c1"] });
    expect(res.status).toBe(403);
    expect(h.customerUpdateMany).not.toHaveBeenCalled();
  });

  it("gán hồ sơ chưa có người phụ trách (không ghi đè khách đã có người), tạo hồ sơ cho khách có đơn chưa có hồ sơ, báo cho người nhận", async () => {
    h.customerFindMany.mockResolvedValue([{ id: "c1", customerCode: "KH1" }]);
    h.customerUpdateMany.mockResolvedValue({ count: 1 });
    h.customerFindUnique.mockResolvedValue(null);
    h.customerCreate.mockResolvedValue({});
    const res = await call({ employeeId: "u-tung", customerIds: ["c1", "c2"], profiles: [{ customerCode: "C.UTECH", customerName: "UTECH VN" }] });
    const json = await res.json();
    expect(json).toMatchObject({ assigned: 1, created: 1 });
    // updateMany chỉ chạm hồ sơ còn chưa gán
    expect(h.customerUpdateMany.mock.calls[0][0].where).toMatchObject({ salesEmployeeId: null });
    expect(h.customerCreate.mock.calls[0][0].data).toMatchObject({ customerCode: "UTECH", salesEmployeeId: "u-tung" });
    expect(h.assignInvoices).toHaveBeenCalledWith("UTECH", "u-tung");
    expect(h.notifCreate.mock.calls[0][0].data).toMatchObject({ userId: "u-tung", type: "CARE_DUE_DAILY" });
  });

  it("từ chối khi chưa chọn khách hoặc người nhận không hợp lệ", async () => {
    expect((await call({ employeeId: "u-tung" })).status).toBe(400);
    h.userFirst.mockResolvedValue(null);
    expect((await call({ employeeId: "x", customerIds: ["c1"] })).status).toBe(400);
  });
});
