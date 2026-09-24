import { describe, it, expect, vi, beforeEach } from "vitest";

// sendEmail mở rộng (cc + attachments) — nodemailer giả, KHÔNG gửi mail thật.
// Chạy: cd apps/worker && npx vitest run

const h = vi.hoisted(() => ({ sendMail: vi.fn(), createTransport: vi.fn(), warn: vi.fn(), error: vi.fn() }));
vi.mock("nodemailer", () => ({ default: { createTransport: h.createTransport } }));
vi.mock("../src/logger", () => ({ logger: { info: vi.fn(), warn: h.warn, error: h.error } }));

async function load(smtp: { user?: string; password?: string }) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ SMTP_USER: smtp.user, SMTP_PASSWORD: smtp.password })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("../src/email");
}

beforeEach(() => {
  vi.clearAllMocks();
  h.sendMail.mockResolvedValue({});
  h.createTransport.mockReturnValue({ sendMail: h.sendMail });
});

describe("sendEmail", () => {
  it("chưa cấu hình SMTP -> false + cảnh báo, không tạo transporter, KHÔNG throw", async () => {
    const m = await load({});
    expect(m.isEmailConfigured()).toBe(false);
    await expect(m.sendEmail("a@x.com", "s", "<p>h</p>")).resolves.toBe(false);
    expect(h.createTransport).not.toHaveBeenCalled();
    expect(h.warn).toHaveBeenCalled();
  });

  it("chỉ có SMTP_USER thiếu mật khẩu -> vẫn coi là chưa cấu hình", async () => {
    const m = await load({ user: "thongbao@gmail.com" });
    expect(m.isEmailConfigured()).toBe(false);
  });

  it("gọi cũ (to là chuỗi, không options) vẫn chạy và KHÔNG có key cc/attachments", async () => {
    const m = await load({ user: "thongbao@gmail.com", password: "pw" });
    expect(await m.sendEmail("a@x.com", "tiêu đề", "<p>h</p>")).toBe(true);
    const mail = h.sendMail.mock.calls[0][0];
    expect(mail).toMatchObject({ to: "a@x.com", subject: "tiêu đề", html: "<p>h</p>" });
    expect(mail.from).toContain("thongbao@gmail.com");
    expect(mail).not.toHaveProperty("cc");
    expect(mail).not.toHaveProperty("attachments");
  });

  it("to là mảng + cc + attachments -> truyền nguyên xuống nodemailer", async () => {
    const m = await load({ user: "thongbao@gmail.com", password: "pw" });
    const file = { filename: "bang-ke.xlsx", content: Buffer.from("x") };
    await m.sendEmail(["a@x.com", "b@y.com"], "s", "h", { cc: ["nv@x.com"], attachments: [file] });
    expect(h.sendMail.mock.calls[0][0]).toMatchObject({ to: ["a@x.com", "b@y.com"], cc: ["nv@x.com"], attachments: [file] });
  });

  it("cc / attachments là mảng rỗng -> bỏ hẳn key", async () => {
    const m = await load({ user: "thongbao@gmail.com", password: "pw" });
    await m.sendEmail("a@x.com", "s", "h", { cc: [], attachments: [] });
    const mail = h.sendMail.mock.calls[0][0];
    expect(mail).not.toHaveProperty("cc");
    expect(mail).not.toHaveProperty("attachments");
  });

  it("THẤT BẠI: SMTP lỗi -> trả false + log lỗi, KHÔNG throw", async () => {
    h.sendMail.mockRejectedValue(new Error("535 bad credentials"));
    const m = await load({ user: "thongbao@gmail.com", password: "pw" });
    await expect(m.sendEmail(["a@x.com", "b@y.com"], "s", "h")).resolves.toBe(false);
    expect(h.error).toHaveBeenCalled();
    expect(String(h.error.mock.calls[0][0])).toContain("a@x.com, b@y.com");
  });

  it("không ghi mật khẩu SMTP vào log lỗi", async () => {
    h.sendMail.mockRejectedValue(new Error("fail"));
    const m = await load({ user: "thongbao@gmail.com", password: "SUPER-SECRET-PW" });
    await m.sendEmail("a@x.com", "s", "h");
    expect(JSON.stringify([...h.error.mock.calls, ...h.warn.mock.calls])).not.toContain("SUPER-SECRET-PW");
  });
});
