import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  trips: vi.fn(),
  stops: vi.fn(),
  count: vi.fn(),
  admins: vi.fn(),
  notifFind: vi.fn(),
  notifCreate: vi.fn(),
  notifUpdate: vi.fn(),
  push: vi.fn(),
}));

vi.mock("@hoanggia/db", () => ({
  prisma: {
    businessTripRequest: { findMany: h.trips, count: h.count },
    businessTripStop: { findMany: h.stops },
    user: { findMany: h.admins },
    notification: { findFirst: h.notifFind, create: h.notifCreate, update: h.notifUpdate },
  },
}));
vi.mock("../src/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../src/push", () => ({ sendPushToUser: h.push }));

import { runTripReminder } from "../src/notifications/tripReminder";

const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
const shiftDay = (n: number) => new Date(new Date(`${todayVN()}T00:00:00Z`).getTime() + n * 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  h.notifFind.mockResolvedValue(null);
  h.notifCreate.mockResolvedValue({ id: "n1" });
  h.push.mockResolvedValue(true);
  h.admins.mockResolvedValue([{ id: "admin1" }]);
  h.count.mockResolvedValue(0);
  h.stops.mockResolvedValue([]);
});

describe("runTripReminder", () => {
  it("nhắc nộp báo cáo: chỉ tính buổi đã qua ngày đi (PENDING) và mọi báo cáo bị yêu cầu bổ sung; gộp 1 thông báo/người", async () => {
    h.trips.mockResolvedValue([
      { employeeId: "u1", visitDate: shiftDay(-2), status: "PENDING" },
      { employeeId: "u1", visitDate: shiftDay(0), status: "PENDING" }, // hôm nay: chưa nhắc
      { employeeId: "u1", visitDate: shiftDay(-1), status: "NEEDS_REVISION" },
      { employeeId: "u2", visitDate: shiftDay(3), status: "PENDING" }, // tương lai
    ]);
    const r = await runTripReminder();
    expect(r.reportDue).toBe(1);
    expect(h.notifCreate).toHaveBeenCalledTimes(1);
    expect(h.notifCreate.mock.calls[0][0].data).toMatchObject({ userId: "u1", type: "TRIP_REPORT_DUE" });
    expect(h.notifCreate.mock.calls[0][0].data.message).toContain("2 buổi");
    expect(h.push).toHaveBeenCalledWith("u1", expect.objectContaining({ url: "/business-trips" }));
  });

  it("không gửi trùng trong ngày", async () => {
    h.trips.mockResolvedValue([{ employeeId: "u1", visitDate: shiftDay(-2), status: "PENDING" }]);
    h.notifFind.mockResolvedValue({ id: "old" });
    const r = await runTripReminder();
    expect(r.reportDue).toBe(0);
    expect(h.notifCreate).not.toHaveBeenCalled();
  });

  it("việc tiếp theo: tới hạn hôm nay + trễ hạn được gom theo người phụ trách; việc chưa tới hạn bỏ qua", async () => {
    h.trips.mockResolvedValue([]);
    h.stops.mockResolvedValue([
      { companyName: "A", nextAction: "Gửi báo giá", nextActionDue: new Date(`${shiftDay(-3).toISOString().slice(0, 10)}T00:00:00+07:00`), nextActionOwnerId: "u1" },
      { companyName: "B", nextAction: "Mang mẫu", nextActionDue: new Date(`${todayVN()}T00:00:00+07:00`), nextActionOwnerId: "u1" },
      { companyName: "C", nextAction: "Gọi lại", nextActionDue: new Date(`${shiftDay(5).toISOString().slice(0, 10)}T00:00:00+07:00`), nextActionOwnerId: "u1" },
    ]);
    const r = await runTripReminder();
    expect(r.nextStepDue).toBe(1);
    const msg = h.notifCreate.mock.calls[0][0].data.message as string;
    expect(msg).toContain("1 việc đến hạn hôm nay");
    expect(msg).toContain("1 việc trễ hạn");
    expect(msg).not.toContain("Gọi lại");
  });

  it("admin được nhắc khi có báo cáo chờ duyệt", async () => {
    h.trips.mockResolvedValue([]);
    h.count.mockResolvedValue(3);
    const r = await runTripReminder();
    expect(r.reviewPending).toBe(1);
    expect(h.notifCreate.mock.calls[0][0].data).toMatchObject({ userId: "admin1", type: "TRIP_REVIEW_PENDING" });
  });
});
