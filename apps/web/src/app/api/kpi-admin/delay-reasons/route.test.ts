import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ auth: vi.fn(), findLine: vi.fn(), upsert: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { poTrackingLine: { findUnique: h.findLine }, deliveryDelayReason: { upsert: h.upsert } },
}));

import { POST } from "./route";

const ADMIN = { user: { id: "u-ngoc", role: "ADMIN", accessLevel: "OPERATOR" } };
const post = (body: unknown) => POST(new Request("http://x/api/kpi-admin/delay-reasons", { method: "POST", body: JSON.stringify(body) }) as never);

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(ADMIN);
  h.findLine.mockResolvedValue({ id: "l1" });
  h.upsert.mockImplementation(async (a: { create: unknown }) => a.create);
});

describe("lý do giao trễ — khách đổi lịch", () => {
  it("khách đổi lịch phải kèm ngày hẹn mới", async () => {
    const res = await post({ lineId: "l1", category: "KHACH_DOI_LICH" });
    expect(res.status).toBe(400);
    expect(h.upsert).not.toHaveBeenCalled();
  });

  it("khách đổi lịch + ngày mới: có hiệu lực ngay (APPROVED), ngày lưu là 00:00 giờ VN", async () => {
    const res = await post({ lineId: "l1", category: "KHACH_DOI_LICH", newDeliveryDate: "2026-11-20" });
    expect(res.status).toBe(201);
    const data = h.upsert.mock.calls[0][0].create;
    expect(data.status).toBe("APPROVED");
    expect(data.newDeliveryDate.toISOString()).toBe("2026-11-19T17:00:00.000Z");
  });

  it("lý do khác vẫn chờ duyệt và không lưu ngày hẹn mới", async () => {
    const res = await post({ lineId: "l1", category: "VAN_CHUYEN", newDeliveryDate: "2026-11-20" });
    expect(res.status).toBe(201);
    const data = h.upsert.mock.calls[0][0].create;
    expect(data.status).toBe("PENDING");
    expect(data.newDeliveryDate).toBeNull();
    expect(data.reviewedAt).toBeNull();
  });
});
