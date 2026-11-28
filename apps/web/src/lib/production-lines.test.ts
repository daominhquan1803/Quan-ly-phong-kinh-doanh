import { describe, it, expect, vi } from "vitest";

const h = vi.hoisted(() => ({ prod: vi.fn() }));
vi.mock("@hoanggia/db", () => ({
  prisma: { productionLine: { findMany: h.prod } },
  normPoStatus: (s: string | null) => (s ?? "").trim().toLowerCase(),
  effectiveDeadline: (d: Date | null) => d,
  stripItemCodeVersionSuffix: (s: string) => s.replace(/\.\d+$/, ""),
}));
vi.mock("@/lib/order-status", () => ({ daysUntilDeadline: () => null }));

import { loadOldPoFilter } from "./production-lines";

const line = (itemCode: string, poDate: string, poCode = "D09.26DT01A") => ({ poCode, itemCode, poDate: new Date(poDate) });
const lsx = { poCodes: ["D09.26DT02A"], itemCode: "SI02", orderedOn: new Date("2026-10-12"), done: false };

describe("loadOldPoFilter", () => {
  it("chỉ bỏ dòng hàng sản xuất đặt trước khi có dữ liệu và không có lệnh", async () => {
    h.prod.mockResolvedValue([lsx]);
    const f = await loadOldPoFilter();
    expect(f.ignore(line("SI01", "2026-09-01"))).toBe(true);
    expect(f.ignore(line("SI02", "2026-09-01", "D09.26DT02A"))).toBe(false); // có lệnh
    expect(f.ignore(line("SI01", "2026-10-20"))).toBe(false); // PO mới
    expect(f.ignore(line("AA07", "2026-09-01"))).toBe(false); // hàng thương mại
    expect(f.count()).toBe(1);
  });

  it("THẤT BẠI: chưa có dữ liệu sản xuất -> không bỏ dòng nào", async () => {
    h.prod.mockResolvedValue([]);
    const f = await loadOldPoFilter();
    expect(f.ignore(line("SI01", "2026-09-01"))).toBe(false);
  });
});
