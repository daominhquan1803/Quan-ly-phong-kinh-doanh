import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  slip: vi.fn(),
  userCount: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: {
    defectReport: { findMany: h.findMany, findFirst: h.findFirst, findUnique: h.findUnique, create: h.create, update: h.update, delete: h.del },
    shipmentSlip: { findUnique: h.slip },
    user: { count: h.userCount },
  },
  Prisma: {},
}));

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[id]/route";

const ADMIN = { user: { id: "u-quan", role: "ADMIN", accessLevel: "FULL" } };
const OPERATOR = { user: { id: "u-ad", role: "ADMIN", accessLevel: "OPERATOR" } };
const SALES = { user: { id: "u-tung", role: "SALES", accessLevel: "FULL" } };
const req = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, { method, body: body ? JSON.stringify(body) : undefined, headers: { "content-type": "application/json" } });
const valid = {
  reportNumber: "BBL-15/10",
  reportDate: "2026-10-15",
  customerCode: "PANASONIC",
  customerName: "Panasonic",
  shipmentSlipId: "slip1",
  description: "Hộp bị móp",
  items: [{ slipItemId: "si1", itemCode: "SB1", itemName: "Hộp SB1", unit: "Cái", deliveredQty: 1000, defectQty: 120 }],
  responsibleUserIds: ["u-tung", "u-ad"],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(OPERATOR);
  h.findMany.mockResolvedValue([]);
  h.findFirst.mockResolvedValue(null);
  h.slip.mockResolvedValue({ slipDate: new Date("2026-10-14T17:00:00Z") });
  h.userCount.mockResolvedValue(2);
  h.create.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));
  h.update.mockImplementation(async ({ data }) => ({ id: "d1", ...data }));
});

describe("lập biên bản hàng lỗi", () => {
  it("Admin kinh doanh lập được: lưu mặt hàng + SL lỗi + người chịu trách nhiệm, ngày giao lấy theo phiếu", async () => {
    const res = await POST(req("/api/defects", "POST", valid));
    expect(res.status).toBe(201);
    const data = h.create.mock.calls[0][0].data;
    expect(data.reportNumber).toBe("BBL-15/10");
    expect(data.deliveryDate).toEqual(new Date("2026-10-14T17:00:00Z"));
    expect(data.items.create[0]).toMatchObject({ itemName: "Hộp SB1", defectQty: 120, slipItemId: "si1" });
    expect(data.responsibles.create).toEqual([{ userId: "u-tung" }, { userId: "u-ad" }]);
    expect(data.createdById).toBe("u-ad");
  });

  it("THẤT BẠI: thiếu mặt hàng / SL lỗi 0 / không có người hoặc bộ phận chịu trách nhiệm / không có phiếu lẫn ngày giao -> 400", async () => {
    for (const bad of [
      { ...valid, items: [] },
      { ...valid, items: [{ ...valid.items[0], defectQty: 0 }] },
      { ...valid, responsibleUserIds: [], otherResponsible: null },
      { ...valid, shipmentSlipId: null, deliveryDate: null },
    ]) {
      expect((await POST(req("/api/defects", "POST", bad))).status).toBe(400);
    }
    expect(h.create).not.toHaveBeenCalled();
  });

  it("chỉ bộ phận khác chịu trách nhiệm (không người nào) vẫn lập được", async () => {
    const res = await POST(req("/api/defects", "POST", { ...valid, responsibleUserIds: [], otherResponsible: "Sản xuất" }));
    expect(res.status).toBe(201);
    expect(h.create.mock.calls[0][0].data.otherResponsible).toBe("Sản xuất");
  });

  it("trùng số biên bản -> 409; NVKD không lập được -> 403", async () => {
    h.findFirst.mockResolvedValueOnce({ id: "old" });
    expect((await POST(req("/api/defects", "POST", valid))).status).toBe(409);
    h.auth.mockResolvedValue(SALES);
    expect((await POST(req("/api/defects", "POST", valid))).status).toBe(403);
  });
});

describe("xem biên bản", () => {
  it("NVKD chỉ thấy biên bản mình chịu trách nhiệm; quản trị thấy tất cả", async () => {
    h.auth.mockResolvedValue(SALES);
    await GET(req("/api/defects?status=OPEN&month=2026-10"));
    const where = h.findMany.mock.calls[0][0].where;
    expect(where.responsibles).toEqual({ some: { userId: "u-tung" } });
    expect(where.status).toBe("OPEN");
    expect(where.reportDate.gte).toEqual(new Date(2026, 9, 1));
    h.auth.mockResolvedValue(OPERATOR);
    await GET(req("/api/defects"));
    expect(h.findMany.mock.calls[1][0].where.responsibles).toBeUndefined();
  });
});

describe("đóng / mở lại / xoá", () => {
  const close = (b: Record<string, unknown>) => PATCH(req("/api/defects/d1", "PATCH", { action: "close", ...b }), { params: { id: "d1" } });

  it("đóng: bắt buộc ghi cách xử lý và chọn có sửa hoá đơn không; có sửa thì phải ghi hoá đơn nào + sửa thế nào", async () => {
    h.findUnique.mockResolvedValue({ id: "d1", status: "OPEN" });
    expect((await close({ resolution: "Đổi hàng", invoiceAdjusted: true })).status).toBe(400);
    expect((await close({ invoiceAdjusted: false })).status).toBe(400);
    const res = await close({ resolution: "Đổi hàng", invoiceAdjusted: true, adjustedInvoiceNumbers: "00003050", invoiceAdjustNote: "Điều chỉnh giảm 120 cái" });
    expect(res.status).toBe(200);
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", closedById: "u-ad", invoiceAdjusted: true, adjustedInvoiceNumbers: "00003050" });
  });

  it("biên bản đã đóng: không đóng lại / sửa được; mở lại + xoá chỉ quản trị hệ thống", async () => {
    h.findUnique.mockResolvedValue({ id: "d1", status: "CLOSED" });
    expect((await close({ resolution: "x", invoiceAdjusted: false })).status).toBe(400);
    expect((await PATCH(req("/api/defects/d1", "PATCH", valid), { params: { id: "d1" } })).status).toBe(400);
    expect((await PATCH(req("/api/defects/d1", "PATCH", { action: "reopen" }), { params: { id: "d1" } })).status).toBe(403);
    expect((await DELETE(req("/api/defects/d1", "DELETE"), { params: { id: "d1" } })).status).toBe(403);
    h.auth.mockResolvedValue(ADMIN);
    expect((await PATCH(req("/api/defects/d1", "PATCH", { action: "reopen" }), { params: { id: "d1" } })).status).toBe(200);
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "OPEN", closedAt: null });
    expect((await DELETE(req("/api/defects/d1", "DELETE"), { params: { id: "d1" } })).status).toBe(200);
  });
});

describe("đóng biên bản: huỷ tại kho khách, trừ công nợ", () => {
  const closeBody = {
    action: "close",
    resolution: "Khách giữ hàng, trừ vào hoá đơn",
    invoiceAdjusted: true,
    adjustedInvoiceNumbers: "0003",
    invoiceAdjustNote: "giảm 5tr",
    resolutionType: "DESTROYED_DEDUCT_DEBT",
    deductAmount: 5000000,
  };
  const patch = (b: unknown) => PATCH(req("/api/defects/d1", "PATCH", b), { params: { id: "d1" } });
  beforeEach(() => {
    h.auth.mockResolvedValue(ADMIN);
    h.findUnique.mockResolvedValue({ id: "d1", status: "OPEN" });
  });

  it("đủ số tiền + hoá đơn thì đóng, lưu loại xử lý", async () => {
    expect((await patch(closeBody)).status).toBe(200);
    expect(h.update.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", resolutionType: "DESTROYED_DEDUCT_DEBT", deductAmount: 5000000 });
  });
  it("THẤT BẠI: thiếu số tiền trừ hoặc không sửa hoá đơn -> 400", async () => {
    for (const bad of [{ ...closeBody, deductAmount: null }, { ...closeBody, invoiceAdjusted: false }, { ...closeBody, adjustedInvoiceNumbers: "" }]) {
      expect((await patch(bad)).status).toBe(400);
    }
    expect(h.update).not.toHaveBeenCalled();
  });
  it("loại khác không lưu số tiền trừ", async () => {
    await patch({ action: "close", resolution: "Đã xử lý", invoiceAdjusted: false });
    expect(h.update.mock.calls[0][0].data).toMatchObject({ resolutionType: "OTHER", deductAmount: null });
  });
  it("biên bản đã có phiếu đổi lỗi thì không sửa danh sách hàng", async () => {
    h.findUnique.mockResolvedValue({ id: "d1", status: "OPEN", _count: { replacements: 1 } });
    expect((await patch(valid)).status).toBe(400);
    expect(h.update).not.toHaveBeenCalled();
  });
});
