import { describe, it, expect } from "vitest";
import { aggregateLookup, itemKey, monthKeys, monthKeyOf, selectDetail, type LookupDelivery, type LookupLine, type LookupMeta } from "./sales-lookup";

const d = (s: string) => new Date(`${s}T00:00:00+07:00`);
const months = ["2026-01", "2026-02", "2026-03"];

const metaOf = (code: string, lastOwner: string | null): LookupMeta => {
  const norm = code.toUpperCase().replace(/^[A-Z]\./, "");
  const dir: Record<string, { name: string; owner: string }> = {
    ABC: { name: "Công ty ABC", owner: "tung" },
    XYZ: { name: "Công ty XYZ", owner: "tan" },
  };
  const m = dir[norm];
  return { code, name: m?.name ?? code, ownerId: m?.owner ?? lastOwner, ownerName: m ? (m.owner === "tung" ? "Tùng" : "Tấn") : "" };
};

const line = (o: Partial<LookupLine>): LookupLine => ({ customerCode: "ABC", poCode: "PO1", poDate: d("2026-01-10"), itemCode: "H1", itemName: "Hộp 1", unit: "Cái", qty: 10, value: 100, salesEmployeeId: null, ...o });
const del = (o: Partial<LookupDelivery>): LookupDelivery => ({ customerCode: "ABC", poCode: "PO1", itemCode: "H1", itemName: "Hộp 1", unit: "Cái", eventDate: d("2026-02-05"), qty: 5, value: 50, fromSlip: false, salesEmployeeId: null, ...o });

describe("tiện ích tháng / khoá", () => {
  it("monthKeys liệt kê đủ tháng, qua năm; from > to thì rỗng", () => {
    expect(monthKeys("2026-01", "2026-03")).toEqual(months);
    expect(monthKeys("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthKeys("2026-05", "2026-04")).toEqual([]);
  });
  it("monthKeyOf tính theo giờ Việt Nam (0h ngày 1 vẫn thuộc tháng đó)", () => {
    expect(monthKeyOf(d("2026-02-01"))).toBe("2026-02");
    expect(monthKeyOf(new Date("2026-01-31T17:00:00Z"))).toBe("2026-02");
  });
  it("itemKey: mã hàng, không có thì tên SP; bỏ khác biệt hoa/khoảng trắng", () => {
    expect(itemKey(" h1 ", "x")).toBe("H1");
    expect(itemKey(null, "Hộp  to")).toBe("HỘP TO");
    expect(itemKey("", null)).toBe("");
  });
});

describe("aggregateLookup", () => {
  it("theo khách: gộp doanh số đơn hàng và đi hàng theo tháng, mã có tiền tố gộp chung", () => {
    const rows = aggregateLookup(
      "customer",
      months,
      [line({}), line({ customerCode: "C.ABC", poCode: "PO2", poDate: d("2026-02-02"), value: 300 })],
      [del({}), del({ customerCode: "C.ABC", eventDate: d("2026-03-03"), value: 70 })],
      metaOf,
      null
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "ABC", name: "Công ty ABC", ownerName: "Tùng", orders: [100, 300, 0], delivered: [0, 50, 70], ordersTotal: 400, deliveredTotal: 120 });
  });

  it("theo mã hàng: gộp mọi khách, ghép tên NVKD của các khách", () => {
    const rows = aggregateLookup("item", months, [line({}), line({ customerCode: "XYZ", poCode: "PO9", value: 40 })], [], metaOf, null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "H1", code: "H1", name: "Hộp 1", ownerName: "Tấn, Tùng", ordersTotal: 140 });
  });

  it("bỏ dòng ngoài khoảng tháng", () => {
    const rows = aggregateLookup("customer", months, [line({ poDate: d("2025-12-31") }), line({ poDate: d("2026-04-01") })], [del({ eventDate: d("2026-04-02") })], metaOf, null);
    expect(rows).toEqual([]);
  });

  it("lọc theo NVKD: chỉ giữ khách của NVKD đó (khách chưa có trong danh sách thì theo NVKD ghi trên dòng PO)", () => {
    const lines = [line({}), line({ customerCode: "XYZ", value: 40 }), line({ customerCode: "LẠ", value: 7, salesEmployeeId: "tung" })];
    const rows = aggregateLookup("customer", months, lines, [], metaOf, "tung");
    expect(rows.map((r) => r.key).sort()).toEqual(["ABC", "LẠ"]);
  });

  it("sắp theo doanh số đơn hàng giảm dần", () => {
    const rows = aggregateLookup("customer", months, [line({ value: 10 }), line({ customerCode: "XYZ", value: 90 })], [], metaOf, null);
    expect(rows.map((r) => r.key)).toEqual(["XYZ", "ABC"]);
  });
});

describe("selectDetail", () => {
  const lines = [line({}), line({ poCode: "PO2", poDate: d("2026-02-02") }), line({ customerCode: "XYZ", poCode: "PO3" })];
  const dels = [del({}), del({ fromSlip: true, eventDate: d("2026-02-20") }), del({ customerCode: "XYZ" })];

  it("chi tiết đơn hàng của 1 khách trong 1 tháng", () => {
    const r = selectDetail("customer", "ABC", "2026-01", "order", lines, dels, metaOf, null);
    expect(r.map((x) => x.poCode)).toEqual(["PO1"]);
    expect(r[0]).toMatchObject({ customerName: "Công ty ABC", itemCode: "H1", value: 100, source: "PO" });
  });

  it("chi tiết đi hàng: phân biệt nguồn phiếu đi hàng và file theo dõi PO", () => {
    const r = selectDetail("customer", "ABC", "2026-02", "delivered", lines, dels, metaOf, null);
    expect(r.map((x) => x.source)).toEqual(["File theo dõi PO", "Phiếu đi hàng"]);
  });

  it("chi tiết theo mã hàng trải qua nhiều khách", () => {
    const r = selectDetail("item", "H1", "2026-01", "order", lines, dels, metaOf, null);
    expect(r.map((x) => x.poCode).sort()).toEqual(["PO1", "PO3"]);
  });

  it("tôn trọng bộ lọc NVKD", () => {
    const r = selectDetail("item", "H1", "2026-01", "order", lines, dels, metaOf, "tung");
    expect(r.map((x) => x.poCode)).toEqual(["PO1"]);
  });
});
