import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ auth: vi.fn(), prod: vi.fn(), po: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: h.auth }));
vi.mock("@/lib/order-status", () => ({ daysUntilDeadline: () => null }));
vi.mock("@hoanggia/db", () => ({
  prisma: { productionLine: { findMany: h.prod }, poTrackingLine: { findMany: h.po } },
  normPoStatus: (s: string | null) => (s ?? "").trim().toLowerCase(),
  effectiveDeadline: (d: Date | null) => d,
  stripItemCodeVersionSuffix: (s: string) => s.replace(/\.\d+$/, ""),
}));

import { GET } from "./route";

const poLine = { poCode: "D11.26DT01A", itemCode: "SI01", itemName: "Nhãn", customerCode: "C.A", statusRaw: "Đang thực hiện", remainingQty: 10, requestedDeliveryDate: null, delayReason: null, salesEmployeeId: "u1", salesEmployee: { name: "NVKD A" } };

beforeEach(() => {
  vi.clearAllMocks();
  h.prod.mockResolvedValue([{ lsxNo: "9", poCodes: ["D11.26DT01A"], itemCode: "SI01", done: true, syncedAt: new Date("2026-11-27") }]);
  h.po.mockResolvedValue([poLine, { ...poLine, statusRaw: "Kết thúc" }]);
});

describe("GET /api/shipping-status/production", () => {
  it("NVKD chỉ truy vấn dòng của mình và không nhận danh sách lệnh không khớp", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    const json = await (await GET()).json();
    expect(h.po).toHaveBeenCalledTimes(1);
    expect(h.po.mock.calls[0][0].where.salesEmployeeId).toBe("u1");
    expect(json.unmatchedLsx).toEqual([]);
    expect(json.lines).toHaveLength(1);
    expect(json.lines[0]).toMatchObject({ status: "DONE", lsxNos: ["9"] });
  });

  it("không thống kê hàng thương mại", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.po.mockResolvedValue([poLine, { ...poLine, itemCode: "AA071" }]);
    const json = await (await GET()).json();
    expect(json.lines.map((l: { itemCode: string }) => l.itemCode)).toEqual(["SI01"]);
  });

  it("chưa đồng bộ được dữ liệu -> không trả trạng thái (tránh báo nhầm 'chưa có lệnh')", async () => {
    h.auth.mockResolvedValue({ user: { id: "u1", role: "SALES" } });
    h.prod.mockResolvedValue([]);
    expect(await (await GET()).json()).toEqual({ syncedAt: null, lines: [], unmatchedLsx: [] });
  });

  it("THẤT BẠI: chưa đăng nhập -> 401", async () => {
    h.auth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });
});
