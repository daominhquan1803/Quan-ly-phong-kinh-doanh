import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({ auth: vi.fn(), defect: vi.fn(), slipItems: vi.fn(), groupBy: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@hoanggia/db", async (orig) => ({
  ...(await orig<typeof import("@hoanggia/db")>()),
  prisma: { defectReport: { findUnique: h.defect }, shipmentSlipItem: { findMany: h.slipItems }, defectReplacement: { groupBy: h.groupBy } },
}));

import { GET } from "./route";

const ADMIN = { user: { id: "u-quan", role: "ADMIN", accessLevel: "FULL" } };
const SALES = { user: { id: "u-tung", role: "SALES", accessLevel: "FULL" } };
const call = () => GET(new NextRequest("http://localhost/x"), { params: { id: "d1" } });
const slip = { id: "s1", slipNumber: "BH1", slipDate: new Date("2026-10-30"), customerName: "Công ty A" };

beforeEach(() => {
  vi.clearAllMocks();
  h.auth.mockResolvedValue(ADMIN);
  h.defect.mockResolvedValue({
    id: "d1",
    status: "OPEN",
    reportNumber: "HL-1",
    customerName: "Công ty A",
    items: [{ id: "di1", itemCode: "SB1", itemName: "Hộp SB1", defectQty: 100 }],
    replacements: [{ defectReportItemId: "di1", quantity: 40 }],
  });
  h.slipItems.mockResolvedValue([
    { id: "si1", itemCode: "SB1.2", itemName: "Hộp SB1", qtyActual: 80, shipmentSlip: slip },
    { id: "si2", itemCode: "SB1", itemName: "Hộp SB1", qtyActual: 20, shipmentSlip: { ...slip, id: "s2", slipNumber: "BH2" } },
  ]);
  h.groupBy.mockResolvedValue([{ shipmentSlipItemId: "si2", _sum: { quantity: 20 } }]);
});

describe("dòng phiếu có thể nối vào biên bản", () => {
  it("quyền: Kinh doanh bị từ chối", async () => {
    h.auth.mockResolvedValue(SALES);
    expect((await call()).status).toBe(403);
  });
  it("trả dòng phiếu còn SL chưa nối, kèm SL lỗi còn thiếu; bỏ dòng đã nối hết", async () => {
    const json = await (await call()).json();
    expect(json.candidates).toHaveLength(1);
    expect(json.candidates[0]).toMatchObject({ slipItemId: "si1", slipNumber: "BH1", availableQty: 80, defectReportItemId: "di1", remaining: 60, sameCustomer: true });
  });
  it("biên bản đã đóng thì không có gợi ý; không tồn tại -> 404", async () => {
    h.defect.mockResolvedValue({ id: "d1", status: "CLOSED", reportNumber: "HL-1", customerName: null, items: [], replacements: [] });
    expect((await (await call()).json()).candidates).toEqual([]);
    h.defect.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });
});
