import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn(), tx: vi.fn(), send: vi.fn() }));
vi.mock("@hoanggia/db", () => ({ prisma: { user: { findFirst: h.findFirst, update: h.update, updateMany: h.updateMany }, $transaction: h.tx } }));
vi.mock("@/lib/zalo-api", () => ({ sendZaloText: h.send }));

import { POST } from "./route";

const post = (body: unknown, secret: string | null = "s3cret-key") =>
  POST(new NextRequest("http://localhost/api/zalo/webhook", {
    method: "POST",
    headers: secret ? { "x-bot-api-secret-token": secret, "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
const textEvent = (text: string) => ({ event_name: "message.text.received", message: { text, chat: { id: "chat9" } } });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ZALO_WEBHOOK_SECRET = "s3cret-key";
  h.send.mockResolvedValue({ ok: true });
  h.tx.mockResolvedValue([]);
});

describe("POST /api/zalo/webhook", () => {
  it("mã 6 số hợp lệ: gắn chat.id vào tài khoản và trả lời xác nhận", async () => {
    h.findFirst.mockResolvedValue({ id: "u1", name: "Tùng" });
    const res = await post(textEvent("123456"));
    expect(res.status).toBe(200);
    expect(h.findFirst.mock.calls[0][0].where.zaloLinkCode).toBe("123456");
    expect(h.tx).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith("chat9", expect.stringContaining("Đã liên kết"));
  });

  it("mã sai/hết hạn: không liên kết, báo lại", async () => {
    h.findFirst.mockResolvedValue(null);
    await post(textEvent("999999"));
    expect(h.tx).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledWith("chat9", expect.stringContaining("hết hạn"));
  });

  it("tin thường: gửi hướng dẫn, không tra mã", async () => {
    await post(textEvent("xin chào"));
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.send).toHaveBeenCalledWith("chat9", expect.stringContaining("Liên kết"));
  });

  it("THẤT BẠI: sai/thiếu secret -> 403, không xử lý gì", async () => {
    expect((await post(textEvent("123456"), "sai-roi-nhe")).status).toBe(403);
    expect((await post(textEvent("123456"), null)).status).toBe(403);
    expect(h.findFirst).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("sự kiện khác (ảnh, sticker...) bị bỏ qua", async () => {
    const res = await post({ event_name: "message.image.received", message: { chat: { id: "c" } } });
    expect(res.status).toBe(200);
    expect(h.send).not.toHaveBeenCalled();
  });
});
