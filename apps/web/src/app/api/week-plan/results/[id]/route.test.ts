import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  ForbiddenError: class ForbiddenError extends Error {},
  UnauthorizedError: class UnauthorizedError extends Error {},
  requireSession: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/rbac", () => ({ requireSession: h.requireSession, ForbiddenError: h.ForbiddenError, UnauthorizedError: h.UnauthorizedError }));
vi.mock("@hoanggia/db", () => ({ prisma: { weekPlanResultEntry: { findUnique: h.findUnique, update: h.update, delete: vi.fn() } } }));

import { PATCH } from "./route";

const params = { params: { id: "e1" } };
// Tuần 4 tháng 11/2026 (23/11–30/11) chưa quá hạn nhập tại thời điểm test; dùng giờ giả để cố định.
const weekStart = new Date(2026, 10, 23);
const entry = {
  id: "e1",
  employeeId: "u1",
  weekStart,
  entryDate: new Date("2026-11-24T00:00:00Z"),
  nextAction: "Gửi báo giá",
  nextActionAt: new Date("2026-11-27T00:00:00Z"),
  contactInfo: null,
};
const full = {
  entryDate: "2026-11-24",
  customerName: "Công ty ABC",
  address: "Bắc Ninh",
  nationality: "Hàn Quốc",
  scale: "50_200",
  contactName: "Chị Lan",
  contactPhone: "0912345678",
  need: "Tem decal",
  workDone: "Gọi điện",
  nextAction: "Gửi báo giá",
  nextActionAt: "2026-11-27",
};
const call = (body: unknown) => PATCH(new Request("http://x/api/week-plan/results/e1", { method: "PATCH", body: JSON.stringify(body) }) as never, params);

describe("PATCH /api/week-plan/results/[id]", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25));
    Object.values(h).forEach((f) => typeof f === "function" && "mockReset" in f && (f as { mockReset: () => void }).mockReset());
    h.requireSession.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.findUnique.mockResolvedValue(entry);
    h.update.mockImplementation(async ({ data }: { data: object }) => ({ id: "e1", ...data }));
  });

  it("không sửa được dòng của người khác", async () => {
    h.requireSession.mockResolvedValue({ user: { id: "u2", role: "SALES" } });
    const res = await call(full);
    expect(res.status).toBe(403);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("thiếu thông tin thì từ chối và nêu mục thiếu", async () => {
    const res = await call({ ...full, need: "" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Chưa đủ thông tin: thiếu nhu cầu");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("ngày phải nằm trong tuần của dòng", async () => {
    const res = await call({ ...full, entryDate: "2026-12-02", nextActionAt: "2026-12-05" });
    expect(res.status).toBe(400);
  });

  it("lưu đủ thông tin; giữ nguyên hành động/ngày hẹn thì không nhắc lại", async () => {
    const res = await call(full);
    expect(res.status).toBe(200);
    const data = h.update.mock.calls[0][0].data;
    expect(data.contactInfo).toBe("Chị Lan - 0912345678");
    expect(data).not.toHaveProperty("followUpNotifiedAt");
  });

  it("đổi ngày hẹn thì nhắc lại theo ngày mới", async () => {
    await call({ ...full, nextActionAt: "2026-11-30" });
    expect(h.update.mock.calls[0][0].data.followUpNotifiedAt).toBeNull();
  });
});
