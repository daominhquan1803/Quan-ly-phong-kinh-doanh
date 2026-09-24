import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// PATCH /api/customers/[id]: sửa Customer.email; NVKD sửa được email khách của MÌNH, không sửa của người khác.

const h = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), update: vi.fn(), invoiceFindMany: vi.fn(), invoiceUpdate: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    customer: { findUnique: h.findUnique, update: h.update, delete: vi.fn() },
    debtInvoice: { findMany: h.invoiceFindMany, update: h.invoiceUpdate },
  },
}));

import { PATCH } from "./route";

const TARGET = { id: "c1", customerCode: "KH1", salesEmployeeId: "u-tung", paymentTermType: null, paymentTermDays: null, paymentTermMonthOffset: null };
const patch = (body: unknown) => PATCH(new NextRequest("http://localhost/api/customers/c1", { method: "PATCH", body: JSON.stringify(body) }), { params: { id: "c1" } });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
  h.findUnique.mockResolvedValue(TARGET);
  h.update.mockImplementation(async ({ data }: { data: object }) => ({ ...TARGET, ...data }));
  h.invoiceFindMany.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("PATCH /api/customers/[id] - email", () => {
  it("NVKD sửa email khách của mình: 'a@x.com; b@y.com' -> lưu 'a@x.com, b@y.com'", async () => {
    const res = await patch({ email: "a@x.com; b@y.com" });
    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0][0].data.email).toBe("a@x.com, b@y.com");
  });

  it("xoá email (chuỗi rỗng) -> null", async () => {
    await patch({ email: "" });
    expect(h.update.mock.calls[0][0].data).toHaveProperty("email", null);
  });

  it("không gửi field email -> KHÔNG đụng tới email đang lưu", async () => {
    await patch({ contactPerson: "Chị Lan" });
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty("email");
  });

  it("THẤT BẠI: có địa chỉ sai -> 400 'Email không hợp lệ: ...', không ghi DB", async () => {
    const res = await patch({ email: "a@x.com, sai" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Email không hợp lệ: sai");
    expect(h.update).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: NVKD sửa email khách của NGƯỜI KHÁC -> 404, không ghi DB", async () => {
    h.findUnique.mockResolvedValue({ ...TARGET, salesEmployeeId: "u-dung" });
    const res = await patch({ email: "a@x.com" });
    expect(res.status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("ADMIN sửa được email khách của bất kỳ NVKD nào", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
    h.findUnique.mockResolvedValue({ ...TARGET, salesEmployeeId: "u-dung" });
    expect((await patch({ email: "a@x.com" })).status).toBe(200);
  });

  it("chỉ sửa email thì KHÔNG tính lại dueDate hoá đơn (dueDate không đổi -> không lọt lại mốc)", async () => {
    await patch({ email: "a@x.com" });
    expect(h.invoiceFindMany).not.toHaveBeenCalled();
    expect(h.invoiceUpdate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/customers/[id] - manualOverdueReminderBase (đợt 3, mục E)", () => {
  it("NVKD điền số lần đã nhắc tay cho khách của mình", async () => {
    const res = await patch({ manualOverdueReminderBase: 3 });
    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0][0].data.manualOverdueReminderBase).toBe(3);
  });

  it("điền 0 -> lưu đúng 0 (khác null, GIẢ ĐỊNH 14), không bị coi là 'không gửi field'", async () => {
    await patch({ manualOverdueReminderBase: 0 });
    expect(h.update.mock.calls[0][0].data).toHaveProperty("manualOverdueReminderBase", 0);
  });

  it("gửi null -> xoá override (về tính theo lịch mặc định)", async () => {
    await patch({ manualOverdueReminderBase: null });
    expect(h.update.mock.calls[0][0].data).toHaveProperty("manualOverdueReminderBase", null);
  });

  it("không gửi field -> KHÔNG đụng tới giá trị đang lưu", async () => {
    await patch({ contactPerson: "Chị Lan" });
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty("manualOverdueReminderBase");
  });

  it("THẤT BẠI: số âm -> 400, không ghi DB", async () => {
    const res = await patch({ manualOverdueReminderBase: -1 });
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("THẤT BẠI: NVKD sửa override cho khách của NGƯỜI KHÁC -> 404", async () => {
    h.findUnique.mockResolvedValue({ ...TARGET, salesEmployeeId: "u-dung" });
    const res = await patch({ manualOverdueReminderBase: 2 });
    expect(res.status).toBe(404);
    expect(h.update).not.toHaveBeenCalled();
  });

  it("biên: 999 hợp lệ, 1000 THẤT BẠI (vượt max)", async () => {
    expect((await patch({ manualOverdueReminderBase: 999 })).status).toBe(200);
    const res2 = await patch({ manualOverdueReminderBase: 1000 });
    expect(res2.status).toBe(400);
  });

  it("THẤT BẠI: số thập phân không hợp lệ (phải là số nguyên)", async () => {
    const res = await patch({ manualOverdueReminderBase: 2.5 });
    expect(res.status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});
