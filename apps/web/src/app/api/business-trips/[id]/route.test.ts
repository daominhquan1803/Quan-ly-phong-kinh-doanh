import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/business-trips/[id]: luồng báo cáo công tác — nộp báo cáo, duyệt, trả lại, quyền, hạn.

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  tripFind: vi.fn(),
  tripUpdate: vi.fn(),
  stopUpdate: vi.fn(),
  photoGroup: vi.fn(),
  userFind: vi.fn(),
  notifCreate: vi.fn(),
  notifMany: vi.fn(),
  locked: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    businessTripRequest: { findUnique: h.tripFind, update: h.tripUpdate },
    businessTripStop: { update: h.stopUpdate },
    businessTripPhoto: { groupBy: h.photoGroup },
    user: { findMany: h.userFind },
    notification: { create: h.notifCreate, createMany: h.notifMany },
    $transaction: async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({ businessTripStop: { update: h.stopUpdate }, businessTripRequest: { update: h.tripUpdate } }),
  },
}));
vi.mock("@/lib/week-plan", () => ({
  isWeekEntryLocked: h.locked,
  snapToWeekStart: (d: Date) => d,
  weekLockedMessage: () => "Tuần này đã khoá",
}));

import { PATCH } from "./route";

const patch = (body: unknown, id = "t1") =>
  PATCH(
    new NextRequest(`http://localhost/api/business-trips/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } }
  );

const pastDay = new Date("2026-10-01T00:00:00Z");
const tripRow = (o: Record<string, unknown> = {}) => ({
  id: "t1",
  employeeId: "u1",
  visitDate: pastDay,
  status: "PENDING",
  employee: { name: "Tùng" },
  stops: [{ id: "s1", orderIndex: 1, checkinLat: null }],
  ...o,
});
const goodReport = {
  action: "report",
  stops: [
    {
      stopId: "s1",
      outcome: "MET",
      contactName: "Anh Nam",
      contactPhone: "0901234567",
      reportContent: "Trao đổi đơn hàng quý 4, khách muốn báo giá thêm dòng mới.",
      nextAction: "Gửi báo giá",
      nextActionDue: "2026-10-20",
      checkin: { lat: 10.8, lng: 106.7, accuracyM: 25 },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
  h.tripFind.mockResolvedValue(tripRow());
  h.tripUpdate.mockResolvedValue({ id: "t1" });
  h.photoGroup.mockResolvedValue([]);
  h.userFind.mockResolvedValue([{ id: "admin1" }]);
  h.locked.mockReturnValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("action report", () => {
  it("NVKD nộp báo cáo hợp lệ -> REPORTED (chưa duyệt), lưu từng khách + định vị, báo admin", async () => {
    const res = await patch(goodReport);
    expect(res.status).toBe(200);
    expect(h.tripUpdate.mock.calls[0][0].data).toMatchObject({ status: "REPORTED", approvedById: null });
    const stopData = h.stopUpdate.mock.calls[0][0].data;
    expect(stopData).toMatchObject({ outcome: "MET", contactName: "Anh Nam", nextAction: "Gửi báo giá", nextActionOwnerId: "u1", checkinLat: 10.8, checkinAccuracyM: 25 });
    expect(h.notifMany).toHaveBeenCalledTimes(1);
  });

  it("Quản trị viên nộp hộ -> duyệt luôn, không bắt buộc ảnh/định vị", async () => {
    h.auth.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    const noProof = { ...goodReport, stops: [{ ...goodReport.stops[0], checkin: undefined }] };
    const res = await patch(noProof);
    expect(res.status).toBe(200);
    expect(h.tripUpdate.mock.calls[0][0].data).toMatchObject({ status: "APPROVED", approvedById: "admin1" });
    expect(h.notifMany).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: Đã gặp mà không có ảnh/định vị -> 400, không ghi gì", async () => {
    const res = await patch({ ...goodReport, stops: [{ ...goodReport.stops[0], checkin: undefined }] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ảnh hoặc định vị/);
    expect(h.stopUpdate).not.toHaveBeenCalled();
  });

  it("có ảnh đã tải lên thay cho định vị -> hợp lệ", async () => {
    h.photoGroup.mockResolvedValue([{ stopId: "s1", _count: { _all: 2 } }]);
    const res = await patch({ ...goodReport, stops: [{ ...goodReport.stops[0], checkin: undefined }] });
    expect(res.status).toBe(200);
  });

  it("THẤT BẠI: ngày đi ở tương lai / thiếu khách / quá hạn khoá / người lạ / sai trạng thái", async () => {
    h.tripFind.mockResolvedValue(tripRow({ visitDate: new Date(Date.now() + 5 * 86_400_000) }));
    expect((await patch(goodReport)).status).toBe(400);

    h.tripFind.mockResolvedValue(tripRow({ stops: [{ id: "s1", checkinLat: null }, { id: "s2", checkinLat: null }] }));
    expect((await patch(goodReport)).status).toBe(400); // thiếu báo cáo khách s2

    h.tripFind.mockResolvedValue(tripRow());
    h.locked.mockReturnValue(true);
    expect((await patch(goodReport)).status).toBe(403);

    h.locked.mockReturnValue(false);
    h.auth.mockResolvedValue({ user: { id: "other", role: "SALES" } });
    expect((await patch(goodReport)).status).toBe(403);

    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.tripFind.mockResolvedValue(tripRow({ status: "REPORTED" }));
    expect((await patch(goodReport)).status).toBe(400);
    expect(h.stopUpdate).not.toHaveBeenCalled();
  });

  it("Không gặp được: bước tiếp theo bị xoá dù client gửi lên", async () => {
    const res = await patch({
      action: "report",
      stops: [{ stopId: "s1", outcome: "NOT_MET", reportContent: "Khách đi vắng cả ngày", nextAction: "x", nextActionDue: "2026-10-20" }],
    });
    expect(res.status).toBe(200);
    expect(h.stopUpdate.mock.calls[0][0].data).toMatchObject({ outcome: "NOT_MET", nextAction: null, nextActionDue: null, nextActionOwnerId: null });
  });
});

describe("duyệt / trả lại / từ chối", () => {
  beforeEach(() => {
    h.auth.mockResolvedValue({ user: { id: "admin1", role: "ADMIN" } });
    h.tripFind.mockResolvedValue(tripRow({ status: "REPORTED" }));
  });

  it("duyệt báo cáo chờ duyệt -> APPROVED + báo nhân viên", async () => {
    expect((await patch({ action: "approve" })).status).toBe(200);
    expect(h.tripUpdate.mock.calls[0][0].data).toMatchObject({ status: "APPROVED", approvedById: "admin1" });
    expect(h.notifCreate.mock.calls[0][0].data).toMatchObject({ userId: "u1", type: "TRIP_REVIEWED" });
  });

  it("THẤT BẠI: không duyệt được buổi chưa có báo cáo; NVKD không duyệt được", async () => {
    h.tripFind.mockResolvedValue(tripRow({ status: "PENDING" }));
    expect((await patch({ action: "approve" })).status).toBe(400);
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.tripFind.mockResolvedValue(tripRow({ status: "REPORTED" }));
    expect((await patch({ action: "approve" })).status).toBe(403);
    expect(h.tripUpdate).not.toHaveBeenCalled();
  });

  it("yêu cầu bổ sung bắt buộc có lý do, rồi chuyển NEEDS_REVISION", async () => {
    expect((await patch({ action: "revise" })).status).toBe(400);
    expect((await patch({ action: "revise", rejectReason: "Thiếu ảnh" })).status).toBe(200);
    expect(h.tripUpdate.mock.calls[0][0].data).toMatchObject({ status: "NEEDS_REVISION", rejectReason: "Thiếu ảnh" });
  });

  it("từ chối; đã duyệt rồi thì không từ chối được nữa", async () => {
    expect((await patch({ action: "reject", rejectReason: "Không hợp lệ" })).status).toBe(200);
    h.tripFind.mockResolvedValue(tripRow({ status: "APPROVED" }));
    expect((await patch({ action: "reject" })).status).toBe(400);
  });
});

describe("huỷ / sửa chỉ khi chưa nộp báo cáo", () => {
  it("không huỷ được đăng ký đã nộp báo cáo", async () => {
    h.tripFind.mockResolvedValue(tripRow({ status: "REPORTED" }));
    expect((await patch({ action: "cancel" })).status).toBe(400);
  });
});
