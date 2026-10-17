import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Phạm vi xem phiếu đi hàng: ADMIN thấy hết; NVKD chỉ thấy phiếu có Số PO thuộc PO của mình (PoTrackingLine.poCode + NVKD) hoặc phiếu mình lập.
const h = vi.hoisted(() => ({ auth: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(), poLines: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { shipmentSlip: { findMany: h.findMany, findUnique: h.findUnique, count: h.count }, poTrackingLine: { findMany: h.poLines } },
}));

import { GET as LIST } from "./route";
import { GET as DETAIL } from "./[id]/route";

const asSales = () => h.auth.mockResolvedValue({ user: { id: "u-tung", role: "SALES" } });
const list = (qs = "") => LIST(new NextRequest(`http://localhost/api/shipment-slips${qs}`));
const detail = (id = "s1") => DETAIL(new NextRequest(`http://localhost/api/shipment-slips/${id}`), { params: { id } });

beforeEach(() => {
  vi.clearAllMocks();
  asSales();
  h.findMany.mockResolvedValue([]);
  h.poLines.mockResolvedValue([{ poCode: "PO-TUNG-1" }, { poCode: "PO-TUNG-2" }]);
});

describe("danh sách phiếu đi hàng", () => {
  it("NVKD: chỉ phiếu có Số PO thuộc PO của mình hoặc phiếu mình lập; truy vấn PO theo đúng NVKD; vẫn tìm được theo từ khoá", async () => {
    const res = await list("?q=panasonic");
    expect(res.status).toBe(200);
    expect(h.poLines.mock.calls[0][0].where).toEqual({ salesEmployeeId: "u-tung" });
    const [scope, search] = h.findMany.mock.calls[0][0].where.AND;
    expect(scope).toEqual({ OR: [{ createdById: "u-tung" }, { items: { some: { poSaleNumber: { in: ["PO-TUNG-1", "PO-TUNG-2"] } } } }] });
    expect(search.OR).toBeTruthy(); // điều kiện tìm (số phiếu / khách / đơn / dòng hàng)
  });

  it("NVKD chưa có PO nào: chỉ còn phiếu do chính mình lập", async () => {
    h.poLines.mockResolvedValue([]);
    await list();
    expect(h.findMany.mock.calls[0][0].where.AND[0]).toEqual({ OR: [{ createdById: "u-tung" }] });
  });

  it("ADMIN: thấy tất cả, không truy vấn PO", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
    await list();
    expect(h.poLines).not.toHaveBeenCalled();
    expect(h.findMany.mock.calls[0][0].where.AND[0]).toEqual({});
  });
});

describe("chi tiết phiếu đi hàng", () => {
  it("NVKD mở phiếu thuộc phụ trách của mình: được xem", async () => {
    h.findUnique.mockResolvedValue({ id: "s1", slipNumber: "PX1", createdById: "u-admin", items: [] });
    h.count.mockResolvedValue(1);
    const res = await detail();
    expect(res.status).toBe(200);
    expect((await res.json()).slip.slipNumber).toBe("PX1");
    expect(h.count.mock.calls[0][0].where.id).toBe("s1");
  });

  it("THẤT BẠI: NVKD mở phiếu của người khác (không có PO của mình) -> 403", async () => {
    h.findUnique.mockResolvedValue({ id: "s2", slipNumber: "PX2", createdById: "u-admin", items: [] });
    h.count.mockResolvedValue(0);
    expect((await detail("s2")).status).toBe(403);
  });

  it("ADMIN xem mọi phiếu, không kiểm PO; chưa đăng nhập 401; không có phiếu 404", async () => {
    h.auth.mockResolvedValue({ user: { id: "u-admin", role: "ADMIN" } });
    h.findUnique.mockResolvedValue({ id: "s3", slipNumber: "PX3", items: [] });
    expect((await detail("s3")).status).toBe(200);
    expect(h.count).not.toHaveBeenCalled();
    h.auth.mockResolvedValue(null);
    expect((await detail()).status).toBe(401);
    asSales();
    h.findUnique.mockResolvedValue(null);
    expect((await detail("x")).status).toBe(404);
  });
});
