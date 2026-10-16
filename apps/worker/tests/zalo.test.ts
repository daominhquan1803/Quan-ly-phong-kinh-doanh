import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), create: vi.fn(), push: vi.fn(), send: vi.fn() }));

vi.mock("@hoanggia/db", () => ({ prisma: { notification: { findMany: h.find, update: h.update, findFirst: vi.fn(), create: h.create } } }));
vi.mock("../src/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/push", () => ({ sendPushToUser: h.push }));
vi.mock("../src/zalo", () => ({ isZaloConfigured: () => true, sendZaloText: h.send }));

import { runZaloDispatch, formatZaloText } from "../src/notifications/zaloDispatch";
import { buildWeekPlanDigest } from "../src/notifications/weekPlanDigest";
import { buildDebtWeekMessage } from "../src/notifications/debtWeekReminder";

// 10:00 giờ VN = 03:00 UTC; 22:00 giờ VN = 15:00 UTC.
const IN_HOURS = new Date("2026-10-16T03:00:00Z");
const NIGHT = new Date("2026-10-16T15:00:00Z");
const linked = new Date("2026-10-15T00:00:00Z");
const notif = (o: Record<string, unknown> = {}, u: Record<string, unknown> = {}) => ({
  id: "n1", type: "WEEK_PLAN_DAILY", title: "T", message: "M", link: "/week-plan", createdAt: new Date("2026-10-16T01:00:00Z"),
  user: { zaloChatId: "chat1", zaloLinkedAt: linked, zaloOffTypes: [], ...u }, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.send.mockResolvedValue({ ok: true });
});
afterEach(() => vi.useRealTimers());

describe("runZaloDispatch", () => {
  it("gửi tin đủ điều kiện và đánh dấu đã gửi", async () => {
    h.find.mockResolvedValue([notif()]);
    const r = await runZaloDispatch(IN_HOURS);
    expect(r).toEqual({ sent: 1, failed: 0 });
    expect(h.send).toHaveBeenCalledWith("chat1", expect.stringContaining("T\nM"));
    expect(h.update.mock.calls[0][0].where).toEqual({ id: "n1" });
  });

  it("ngoài khung 7h-20h: không gửi, không truy vấn", async () => {
    expect(await runZaloDispatch(NIGHT)).toEqual({ sent: 0, failed: 0 });
    expect(h.find).not.toHaveBeenCalled();
  });

  it("bỏ qua: tin tạo trước lúc liên kết, loại đã tắt", async () => {
    h.find.mockResolvedValue([
      notif({ id: "a", createdAt: new Date("2026-10-14T00:00:00Z") }),
      notif({ id: "b" }, { zaloOffTypes: ["WEEK_PLAN_DAILY"] }),
    ]);
    expect(await runZaloDispatch(IN_HOURS)).toEqual({ sent: 0, failed: 0 });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: Zalo lỗi -> không đánh dấu đã gửi, tính failed, bỏ cuộc sau 5 lần", async () => {
    h.send.mockResolvedValue({ ok: false, error: "x" });
    h.find.mockResolvedValue([notif({ id: "fail1" })]);
    for (let i = 0; i < 5; i++) expect((await runZaloDispatch(IN_HOURS)).failed).toBe(1);
    expect(h.update).not.toHaveBeenCalled();
    expect(await runZaloDispatch(IN_HOURS)).toEqual({ sent: 0, failed: 0 }); // lần 6: không thử nữa
    expect(h.send).toHaveBeenCalledTimes(5);
  });

  it("formatZaloText gắn đường dẫn khi có APP_PUBLIC_URL", () => {
    expect(formatZaloText({ title: "A", message: "B", link: null })).toBe("A\nB");
  });
});

describe("buildWeekPlanDigest", () => {
  const labels = { Q: "Số báo giá mới", T: "Số buổi đi công tác", C: "Liên hệ mới" };
  const m = (target: number, actual: number, weight: number) => ({ target, actual, weight, point: target ? Math.round((actual / target) * weight * 10) / 10 : 0 });

  it("nêu điểm + 3 mục thiếu điểm nhiều nhất, sắp theo điểm mất", () => {
    const r = buildWeekPlanDigest({ totalPoints: 45, metrics: { Q: m(5, 1, 20), T: m(3, 0, 30), C: m(10, 8, 20), X: m(0, 0, 0) } }, labels, "Tuần 3 (12/10–18/10)", 4);
    expect(r.title).toBe("Kế hoạch tuần: 45/100 điểm");
    expect(r.message).toContain("chưa đạt (cần ≥ 80)");
    expect(r.message).toContain("Còn 4 ngày");
    expect(r.message.indexOf("Số buổi đi công tác 0/3 (thiếu 30 điểm)")).toBeLessThan(r.message.indexOf("Số báo giá mới 1/5 (thiếu 16 điểm)"));
    expect(r.message).not.toContain("X "); // mục không có chỉ tiêu bị bỏ
  });

  it("đạt đủ mọi mục -> báo đã đủ chỉ tiêu", () => {
    const r = buildWeekPlanDigest({ totalPoints: 100, metrics: { Q: m(5, 5, 100) } }, labels, "Tuần 1", 0);
    expect(r.message).toContain("đã đạt");
    expect(r.message).toContain("ngày cuối tuần");
    expect(r.message).toContain("Đã đủ chỉ tiêu");
  });
});

describe("buildDebtWeekMessage", () => {
  it("tổng khoản + phần trượt", () => {
    const r = buildDebtWeekMessage({ employeeId: "u", plannedCount: 3, plannedAmount: 1_000_000, slippedCount: 2, slippedAmount: 500_000 });
    expect(r.title).toBe("Tuần này cần thu 5 khoản công nợ");
    expect(r.message).toContain("2 khoản trượt từ tuần trước");
  });
  it("không trượt thì không nhắc phần trượt", () => {
    const r = buildDebtWeekMessage({ employeeId: "u", plannedCount: 1, plannedAmount: 10, slippedCount: 0, slippedAmount: 0 });
    expect(r.message).not.toContain("trượt từ");
  });
});
