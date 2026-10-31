import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ auth: vi.fn(), slipItem: vi.fn(), tx: {} as Record<string, any> }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", () => ({
  prisma: { shipmentSlipItem: { findUnique: h.slipItem }, $transaction: (cb: (tx: unknown) => unknown) => cb(h.tx) },
  Prisma: {},
}));

import { POST } from "./route";

const ADMIN = { user: { id: "u-quan", role: "ADMIN", accessLevel: "FULL" } };
const SALES = { user: { id: "u-tung", role: "SALES", accessLevel: "FULL" } };
const call = (body: unknown) =>
  POST(new NextRequest("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), { params: { id: "si1" } });

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(ADMIN);
  h.slipItem.mockResolvedValue({ id: "si1", qtyActual: 100 });
  h.tx = {
    defectReportItem: {
      findUnique: vi.fn().mockResolvedValue({ id: "di1", defectReportId: "d1", defectQty: 100, defectReport: { status: "OPEN" } }),
      findMany: vi.fn().mockResolvedValue([{ id: "di1", defectQty: 100 }]),
    },
    defectReplacement: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
      create: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([{ defectReportItemId: "di1", _sum: { quantity: 100 } }]),
      findMany: vi.fn().mockResolvedValue([{ shipmentSlipItem: { shipmentSlip: { slipNumber: "BH1", slipDate: new Date("2026-10-30") } } }]),
    },
    shipmentSlipItem: { update: vi.fn().mockResolvedValue({}) },
    defectReport: { update: vi.fn().mockResolvedValue({}) },
  };
});

describe("xác nhận đổi lỗi", () => {
  it("quyền: Kinh doanh bị từ chối", async () => {
    h.auth.mockResolvedValue(SALES);
    expect((await call({ defectReportItemId: "di1", quantity: 10 })).status).toBe(403);
  });
  it("đổi đủ thì đóng biên bản, closedAt = ngày phiếu, đánh dấu dòng phiếu bỏ qua", async () => {
    const res = await call({ defectReportItemId: "di1", quantity: 100 });
    expect(await res.json()).toEqual({ ok: true, closed: true });
    expect(h.tx.shipmentSlipItem.update).toHaveBeenCalledWith({ where: { id: "si1" }, data: { issueIgnored: true } });
    expect(h.tx.defectReport.update.mock.calls[0][0].data).toMatchObject({ status: "CLOSED", resolutionType: "REPLACED", closedAt: new Date("2026-10-30"), closedById: "u-quan" });
  });
  it("đổi thiếu thì giữ biên bản mở", async () => {
    h.tx.defectReplacement.groupBy.mockResolvedValue([{ defectReportItemId: "di1", _sum: { quantity: 60 } }]);
    const res = await call({ defectReportItemId: "di1", quantity: 60 });
    expect(await res.json()).toEqual({ ok: true, closed: false });
    expect(h.tx.defectReport.update).not.toHaveBeenCalled();
  });
  it("THẤT BẠI: vượt SL thực xuất, vượt SL lỗi còn thiếu, biên bản đã đóng", async () => {
    expect((await call({ defectReportItemId: "di1", quantity: 101 })).status).toBe(400);
    h.tx.defectReplacement.aggregate.mockResolvedValueOnce({ _sum: { quantity: 0 } }).mockResolvedValueOnce({ _sum: { quantity: 50 } });
    expect((await call({ defectReportItemId: "di1", quantity: 60 })).status).toBe(400);
    h.tx.defectReportItem.findUnique.mockResolvedValue({ id: "di1", defectReportId: "d1", defectQty: 100, defectReport: { status: "CLOSED" } });
    expect((await call({ defectReportItemId: "di1", quantity: 10 })).status).toBe(400);
    expect(h.tx.defectReplacement.create).not.toHaveBeenCalled();
  });
});
