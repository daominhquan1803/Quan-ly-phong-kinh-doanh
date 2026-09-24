import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// Nút "Gửi ngay": kiểm quyền TRƯỚC khi gọi worker; web không tự gửi mail.

const h = vi.hoisted(() => ({ auth: vi.fn(), findFirst: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({ prisma: { debtInvoice: { findFirst: h.findFirst } } }));

import { POST } from "./route";

const SALES = { user: { id: "u-tung", role: "SALES" } };
const ADMIN = { user: { id: "u-admin", role: "ADMIN" } };

function post(body: unknown) {
  return POST(new NextRequest("http://localhost/api/debt/reminders/send", { method: "POST", body: JSON.stringify(body) }));
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(SALES);
  h.findFirst.mockResolvedValue({ id: "inv1" });
  process.env.INTERNAL_SYNC_TOKEN = "tok";
  process.env.WORKER_INTERNAL_URL = "http://worker:4001";
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ checked: 1, sent: 1, skippedNoEmail: 0, notifiedMissingDueDate: 0 }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.WORKER_INTERNAL_URL;
});

describe("POST /api/debt/reminders/send", () => {
  it("chưa đăng nhập -> 401, không gọi worker", async () => {
    h.auth.mockResolvedValue(null);
    const res = await post({ customerCode: "KH1", milestone: "D7" });
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("milestone sai / thiếu mã khách -> 400, không gọi worker", async () => {
    expect((await post({ customerCode: "KH1", milestone: "D3" })).status).toBe(400);
    expect((await post({ customerCode: "  ", milestone: "D7" })).status).toBe(400);
    expect((await post({ milestone: "D7" })).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("NVKD gửi cho khách KHÔNG có hoá đơn của mình -> 404, worker không bị gọi", async () => {
    h.findFirst.mockResolvedValue(null);
    const res = await post({ customerCode: "KH-CUA-NGUOI-KHAC", milestone: "D7" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Không tìm thấy công nợ của khách hàng này");
    expect(h.findFirst.mock.calls[0][0].where).toEqual({ customerCode: "KH-CUA-NGUOI-KHAC", salesEmployeeId: "u-tung" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("milestone D0 hợp lệ", async () => {
    const res = await post({ customerCode: "KH1", milestone: "D0" });
    expect(res.status).toBe(200);
  });

  it("ADMIN không bị giới hạn theo NVKD", async () => {
    h.auth.mockResolvedValue(ADMIN);
    await post({ customerCode: "KH1", milestone: "OVERDUE" });
    expect(h.findFirst.mock.calls[0][0].where).toEqual({ customerCode: "KH1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("thành công: gọi worker /notify-debt-due đúng token + body (triggeredBy = id người bấm) và trả nguyên kết quả", async () => {
    const res = await post({ customerCode: " KH1 ", milestone: "D7" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sent: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://worker:4001/notify-debt-due");
    expect(init.method).toBe("POST");
    expect(init.headers["X-Internal-Token"]).toBe("tok");
    expect(JSON.parse(init.body)).toEqual({ customerCode: "KH1", milestone: "D7", triggeredBy: "u-tung" });
  });

  it("worker báo tính năng đang tắt -> lý do (skippedReason) được chuyển nguyên cho người bấm", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ checked: 0, sent: 0, skippedNoEmail: 0, notifiedMissingDueDate: 0, skippedReason: "Gửi thư nhắc công nợ đang TẮT" }) });
    const body = await (await post({ customerCode: "KH1", milestone: "D7" })).json();
    expect(body.sent).toBe(0);
    expect(body.skippedReason).toMatch(/TẮT/);
  });

  it("thiếu INTERNAL_SYNC_TOKEN -> 500, không gọi worker", async () => {
    delete process.env.INTERNAL_SYNC_TOKEN;
    expect((await post({ customerCode: "KH1", milestone: "D7" })).status).toBe(500);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("worker trả lỗi -> 502 kèm message của worker", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "SMTP hỏng" }) });
    const res = await post({ customerCode: "KH1", milestone: "D7" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("SMTP hỏng");
  });

  it("worker không chạy (fetch ném lỗi) -> 502 với message tiếng Việt", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await post({ customerCode: "KH1", milestone: "D7" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Không gọi được service gửi thư. Kiểm tra worker có đang chạy không.");
  });
});
