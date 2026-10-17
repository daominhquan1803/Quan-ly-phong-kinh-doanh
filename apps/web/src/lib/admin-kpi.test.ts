import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", () => ({ prisma: {} }));

import { bandScore, countScore, evalComplaints, evalPayments, evalSlips, lineVerdict, weekPointOf, workingDeadline, type LineIn } from "./admin-kpi";

const vn = (s: string) => new Date(`${s}+07:00`);

describe("workingDeadline (Chủ nhật nghỉ, Thứ 7 làm)", () => {
  it("D+1 của Thứ 6 là hết Thứ 7", () => {
    expect(workingDeadline(vn("2026-10-16T15:00:00"), 1)).toEqual(vn("2026-10-18T00:00:00"));
  });
  it("D+1 của Thứ 7 bỏ qua Chủ nhật, hạn hết Thứ 2", () => {
    expect(workingDeadline(vn("2026-10-17T09:00:00"), 1)).toEqual(vn("2026-10-20T00:00:00"));
  });
  it("2 ngày làm việc từ Thứ 6 = hết Thứ 2", () => {
    expect(workingDeadline(vn("2026-10-16T00:00:00"), 2)).toEqual(vn("2026-10-20T00:00:00"));
  });
});

describe("chấm điểm", () => {
  it("bandScore: ≥95 đủ, ≥90 70%, ≥80 40%, dưới 0; không có dữ liệu = đủ", () => {
    expect(bandScore(96, 20)).toBe(20);
    expect(bandScore(92, 20)).toBe(14);
    expect(bandScore(85, 20)).toBe(8);
    expect(bandScore(70, 20)).toBe(0);
    expect(bandScore(null, 20)).toBe(20);
  });
  it("countScore theo bảng, quá bảng = 0", () => {
    expect(countScore(0, [15, 10, 5])).toBe(15);
    expect(countScore(2, [15, 10, 5])).toBe(5);
    expect(countScore(3, [15, 10, 5])).toBe(0);
  });
  it("điểm tuần: ≥80 -> 2, 60–79 -> 1, dưới 60 -> 0", () => {
    expect(weekPointOf(80)).toBe(2);
    expect(weekPointOf(65)).toBe(1);
    expect(weekPointOf(59.9)).toBe(0);
  });
});

describe("đánh giá dữ liệu", () => {
  it("tiền về: nhập trong ngày làm việc kế tiếp mới đạt", () => {
    const r = evalPayments([
      { paymentDate: vn("2026-10-16T00:00:00"), createdAt: vn("2026-10-17T10:00:00") }, // Thứ 6 -> nhập Thứ 7: đạt
      { paymentDate: vn("2026-10-17T00:00:00"), createdAt: vn("2026-10-19T16:00:00") }, // Thứ 7 -> nhập Thứ 2: đạt
      { paymentDate: vn("2026-10-15T00:00:00"), createdAt: vn("2026-10-17T08:00:00") }, // Thứ 5 -> nhập Thứ 7: trễ
      { paymentDate: null, createdAt: vn("2026-10-17T08:00:00") }, // không có ngày: bỏ qua
    ]);
    expect(r).toEqual({ total: 3, onTime: 2, pct: 66.7 });
  });
  it("phiếu đi hàng: trong 2 ngày làm việc", () => {
    const r = evalSlips([
      { slipDate: vn("2026-10-16T00:00:00"), createdAt: vn("2026-10-19T20:00:00") },
      { slipDate: vn("2026-10-16T00:00:00"), createdAt: vn("2026-10-20T08:00:00") },
    ]);
    expect(r).toEqual({ total: 2, onTime: 1, pct: 50 });
  });
  it("khiếu nại: phản hồi 24h; chưa tới hạn mà chưa phản hồi thì chưa tính", () => {
    const now = vn("2026-10-17T12:00:00");
    const r = evalComplaints(
      [
        { receivedAt: vn("2026-10-15T08:00:00"), createdAt: vn("2026-10-15T09:00:00"), respondedAt: vn("2026-10-15T20:00:00"), closedAt: null }, // đạt
        { receivedAt: vn("2026-10-14T08:00:00"), createdAt: vn("2026-10-14T09:00:00"), respondedAt: null, closedAt: null }, // quá 24h chưa phản hồi
        { receivedAt: vn("2026-10-17T08:00:00"), createdAt: vn("2026-10-17T09:00:00"), respondedAt: null, closedAt: null }, // chưa tới hạn
      ],
      now,
      false
    );
    expect(r).toEqual({ total: 2, ok: 1, pct: 50 });
  });
  it("giao hàng: trễ có lý do được duyệt (không phải lỗi Admin) thì miễn", () => {
    const now = vn("2026-10-17T12:00:00");
    const line = (over: Partial<LineIn>): LineIn => ({
      id: "l",
      poCode: "PO1",
      itemCode: null,
      itemName: null,
      customerCode: null,
      requestedDeliveryDate: vn("2026-10-10T00:00:00"),
      poQuantity: 100,
      poValue: 1000,
      events: [],
      reason: null,
      ...over,
    });
    expect(lineVerdict(line({ events: [{ eventDate: vn("2026-10-10T15:00:00"), quantity: 100 }] }), now)).toBe("ON_TIME");
    expect(lineVerdict(line({ events: [{ eventDate: vn("2026-10-11T08:00:00"), quantity: 100 }] }), now)).toBe("LATE");
    expect(lineVerdict(line({ requestedDeliveryDate: vn("2026-10-20T00:00:00") }), now)).toBe("NOT_DUE");
    const reason = { id: "r", category: "SAN_XUAT", note: null, status: "APPROVED" as const, reviewNote: null };
    expect(lineVerdict(line({ reason }), now)).toBe("EXEMPT");
    expect(lineVerdict(line({ reason: { ...reason, status: "PENDING" } }), now)).toBe("LATE");
    expect(lineVerdict(line({ reason: { ...reason, category: "ADMIN" } }), now)).toBe("LATE");
  });
});
