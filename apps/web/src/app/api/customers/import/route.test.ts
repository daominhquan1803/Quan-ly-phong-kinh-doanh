import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

// Import "Danh sách khách hàng": cột thứ 5 Email; file cũ 4 cột vẫn chạy; không ghi đè email nhập tay;
// địa chỉ sai bị bỏ qua + báo lại (không làm fail cả file).

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  orderFindMany: vi.fn(),
  customerFindMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  resolveEmployee: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { order: { findMany: h.orderFindMany }, customer: { findMany: h.customerFindMany, create: h.create, update: h.update } },
  resolveEmployeeIdByName: h.resolveEmployee,
}));

import { POST } from "./route";

function xlsxFile(rows: (string | number)[][]): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "S1");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new File([new Uint8Array(buf)], "khach.xlsx");
}
async function upload(rows: (string | number)[][]) {
  const fd = new FormData();
  fd.set("file", xlsxFile(rows));
  const res = await POST(new NextRequest("http://localhost/api/customers/import", { method: "POST", body: fd }));
  return { status: res.status, body: await res.json() };
}

const H5 = ["Mã", "Tên", "Hạn", "NV", "Email"];

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
  h.orderFindMany.mockResolvedValue([]);
  h.customerFindMany.mockResolvedValue([]);
  h.resolveEmployee.mockResolvedValue("u-tung");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/customers/import - email", () => {
  it("file 5 cột: khách mới được tạo kèm email đã chuẩn hoá", async () => {
    const { status, body } = await upload([H5, ["KH1", "Công ty A", 30, "Tùng", "a@x.com ; b@y.com"]]);
    expect(status).toBe(200);
    expect(body.createdCount).toBe(1);
    expect(h.create.mock.calls[0][0].data).toMatchObject({ customerCode: "KH1", email: "a@x.com, b@y.com", paymentTermDays: 30 });
    expect(body.invalidEmailCount).toBe(0);
  });

  it("tương thích ngược: file cũ 4 cột vẫn import, không có key email", async () => {
    const { status, body } = await upload([H5.slice(0, 4), ["KH1", "Công ty A", 30, "Tùng"]]);
    expect(status).toBe(200);
    expect(body.createdCount).toBe(1);
    expect(h.create.mock.calls[0][0].data).not.toHaveProperty("email");
  });

  it("khách đã có email nhập tay -> KHÔNG ghi đè", async () => {
    h.customerFindMany.mockResolvedValue([{ customerCode: "KH1", contactPerson: null, email: "tay@x.com" }]);
    const { body } = await upload([H5, ["KH1", "Công ty A", 30, "Tùng", "file@x.com"]]);
    expect(body.updatedCount).toBe(1);
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty("email");
  });

  it("khách đã có nhưng email đang trống -> được điền", async () => {
    h.customerFindMany.mockResolvedValue([{ customerCode: "KH1", contactPerson: null, email: null }]);
    await upload([H5, ["KH1", "Công ty A", 30, "Tùng", "file@x.com"]]);
    expect(h.update.mock.calls[0][0].data.email).toBe("file@x.com");
  });

  it("ô email trống trong file -> không xoá email đã có", async () => {
    h.customerFindMany.mockResolvedValue([{ customerCode: "KH1", contactPerson: null, email: "tay@x.com" }]);
    await upload([H5, ["KH1", "Công ty A", 30, "Tùng", ""]]);
    expect(h.update.mock.calls[0][0].data).not.toHaveProperty("email");
  });

  it("THẤT BẠI một phần: địa chỉ sai bị BỎ QUA và báo lại, địa chỉ đúng + các trường khác vẫn import", async () => {
    const { status, body } = await upload([H5, ["KH1", "Công ty A", 30, "Tùng", "a@x.com; abc"]]);
    expect(status).toBe(200);
    expect(body.invalidEmailCount).toBe(1);
    expect(body.invalidEmails).toEqual(['KH1: "abc"']);
    const data = h.create.mock.calls[0][0].data;
    expect(data.email).toBe("a@x.com");
    expect(data.customerName).toBe("Công ty A");
  });

  it("toàn bộ địa chỉ sai -> không lưu email nào (không nhận địa chỉ sai), khách vẫn được tạo", async () => {
    const { body } = await upload([H5, ["KH1", "Công ty A", 30, "Tùng", "abc; xyz@"]]);
    expect(body.createdCount).toBe(1);
    expect(body.invalidEmailCount).toBe(2);
    expect(h.create.mock.calls[0][0].data).not.toHaveProperty("email");
  });

  it("THẤT BẠI: không phải ADMIN -> 403, không ghi DB", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
    const { status } = await upload([H5, ["KH1", "Công ty A", 30, "Tùng", "a@x.com"]]);
    expect(status).toBe(403);
    expect(h.create).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
  });
});
