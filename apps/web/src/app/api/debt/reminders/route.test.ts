import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Lịch sử thư nhắc: ADMIN thấy tất, NVKD chỉ thấy thư của hoá đơn mình phụ trách.

const h = vi.hoisted(() => ({ auth: vi.fn(), logFindMany: vi.fn(), userFindMany: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { debtReminderLog: { findMany: h.logFindMany }, user: { findMany: h.userFindMany } },
}));

import { GET } from "./route";

const get = (qs = "") => GET(new NextRequest(`http://localhost/api/debt/reminders${qs}`));
const logRow = (over: Record<string, unknown> = {}) => ({ id: "l1", milestone: "D7", triggeredBy: "CRON", sentAt: new Date(), invoice: {}, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
  h.logFindMany.mockResolvedValue([]);
  h.userFindMany.mockResolvedValue([]);
});

describe("GET /api/debt/reminders", () => {
  it("chưa đăng nhập -> 401", async () => {
    h.auth.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(h.logFindMany).not.toHaveBeenCalled();
  });

  it("NVKD chỉ thấy thư của hoá đơn mình (scope qua invoice.salesEmployeeId)", async () => {
    await get();
    expect(h.logFindMany.mock.calls[0][0].where).toEqual({ invoice: { salesEmployeeId: "u-tung" } });
  });

  it("ADMIN thấy tất cả (không giới hạn NVKD)", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
    await get();
    expect(h.logFindMany.mock.calls[0][0].where).toEqual({ invoice: {} });
  });

  it("q tìm theo tên/mã khách/số hoá đơn mà VẪN giữ scope NVKD", async () => {
    await get("?q=abc");
    const { invoice } = h.logFindMany.mock.calls[0][0].where;
    expect(invoice.salesEmployeeId).toBe("u-tung");
    expect(invoice.OR).toHaveLength(3);
  });

  it("lọc milestone hợp lệ; milestone lạ bị bỏ qua (không lọc, không lỗi)", async () => {
    await get("?milestone=OVERDUE");
    expect(h.logFindMany.mock.calls[0][0].where.milestone).toBe("OVERDUE");
    await get("?milestone=XYZ");
    expect(h.logFindMany.mock.calls[1][0].where.milestone).toBeUndefined();
  });

  it("có chặn trên 2000 dòng, mới nhất trước", async () => {
    await get();
    expect(h.logFindMany.mock.calls[0][0]).toMatchObject({ take: 2000, orderBy: { sentAt: "desc" } });
  });

  it("triggeredBy: CRON -> null (Tự động); User.id -> tên người bấm; id đã bị xoá -> null", async () => {
    h.logFindMany.mockResolvedValue([logRow({ triggeredBy: "CRON" }), logRow({ id: "l2", triggeredBy: "u-tung" }), logRow({ id: "l3", triggeredBy: "u-da-xoa" })]);
    h.userFindMany.mockResolvedValue([{ id: "u-tung", name: "Ngô Thanh Tùng" }]);
    const { logs } = await (await get()).json();
    expect(logs.map((l: { triggeredByName: string | null }) => l.triggeredByName)).toEqual([null, "Ngô Thanh Tùng", null]);
    expect(h.userFindMany.mock.calls[0][0].where.id.in.sort()).toEqual(["u-da-xoa", "u-tung"]);
  });

  it("toàn thư tự động -> không truy vấn bảng User", async () => {
    h.logFindMany.mockResolvedValue([logRow()]);
    await get();
    expect(h.userFindMany).not.toHaveBeenCalled();
  });

  it("lỗi DB -> 500 tiếng Việt", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.logFindMany.mockRejectedValue(new Error("db down"));
    const res = await get();
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe("Không tải được lịch sử thư nhắc công nợ");
  });
});
