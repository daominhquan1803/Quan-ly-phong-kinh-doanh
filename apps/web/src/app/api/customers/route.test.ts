import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// POST /api/customers: nhận Customer.email (nhiều địa chỉ), validate TỪNG địa chỉ ở biên.

const h = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({ prisma: { customer: { findUnique: h.findUnique, create: h.create, findMany: vi.fn() } } }));

import { POST } from "./route";

const post = (body: unknown) => POST(new NextRequest("http://localhost/api/customers", { method: "POST", body: JSON.stringify(body) }));
const base = { customerCode: "KH1", customerName: "Công ty A" };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
  h.findUnique.mockResolvedValue(null);
  h.create.mockImplementation(async ({ data }: { data: unknown }) => ({ id: "c1", ...(data as object) }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/customers - email nhận thư nhắc", () => {
  it("nhiều email cách nhau ; -> lưu dạng 'a, b' và giữ nguyên hoa/thường", async () => {
    const res = await post({ ...base, email: " A@x.com ;  b@y.com " });
    expect(res.status).toBe(201);
    expect(h.create.mock.calls[0][0].data.email).toBe("A@x.com, b@y.com");
  });

  it("không có email / rỗng -> lưu null", async () => {
    await post(base);
    await post({ ...base, email: "   " });
    await post({ ...base, email: null });
    expect(h.create.mock.calls.map((c) => c[0].data.email)).toEqual([null, null, null]);
  });

  it("THẤT BẠI: 1 địa chỉ sai -> 400 'Email không hợp lệ: <địa chỉ>' và KHÔNG tạo khách", async () => {
    const res = await post({ ...base, email: "a@x.com; abc" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Email không hợp lệ: abc");
    expect(h.create).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: ký tự xuống dòng để chèn Bcc -> 400", async () => {
    const res = await post({ ...base, email: "a@x.com\nBcc: x@evil.com" });
    expect(res.status).toBe(400);
    expect(h.create).not.toHaveBeenCalled();
  });

  it("chưa đăng nhập -> 401", async () => {
    h.auth.mockResolvedValue(null);
    expect((await post({ ...base, email: "a@x.com" })).status).toBe(401);
  });
});
