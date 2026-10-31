import { describe, expect, it } from "vitest";
import { suggestCustomers, type SuggestInput } from "./trip-suggestions";

const NOW = new Date("2026-11-01T00:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
let k = 0;
const C = (o: Partial<SuggestInput>): SuggestInput => ({
  id: `c${++k}`,
  customerCode: `KH${k}`,
  customerName: `Công ty ${k}`,
  address: "KCN, Tỉnh Hưng Yên",
  province: "Hưng Yên",
  employeeId: "u2",
  employeeName: "Dung",
  orders12: 3,
  lastOrderAt: day(30),
  lastTouchAt: day(10),
  ...o,
});
const opts = { provinces: ["Hưng Yên"], tripEmployeeId: "u1", excludeNames: [] as string[], now: NOW };

describe("suggestCustomers", () => {
  it("lấy khách đúng tỉnh (kể cả tỉnh cũ), bỏ khách tỉnh khác", () => {
    const ok = C({ province: "Thái Bình" });
    const other = C({ province: "Hà Nội" });
    const r = suggestCustomers([ok, other], opts);
    expect(r.map((x) => x.customerId)).toEqual([ok.id]);
  });
  it("chỉ lấy khách có đơn trong 24 tháng", () => {
    const recent = C({ lastOrderAt: day(700) });
    const old = C({ lastOrderAt: day(800) });
    const never = C({ lastOrderAt: null });
    expect(suggestCustomers([recent, old, never], opts).map((x) => x.customerId)).toEqual([recent.id]);
  });
  it("khách chưa phân NVKD vẫn được gợi ý", () => {
    const free = C({ employeeId: null, employeeName: "(chưa phân)" });
    expect(suggestCustomers([free], opts)[0]).toMatchObject({ employeeId: null, employeeName: "(chưa phân)" });
  });
  it("loại khách của người đi chính và khách đã là điểm dừng", () => {
    const mine = C({ employeeId: "u1", employeeName: "Tùng" });
    const stop = C({ customerName: "CÔNG TY TNHH RISE VIỆT NAM" });
    const keep = C({});
    const r = suggestCustomers([mine, stop, keep], { ...opts, excludeNames: ["Rise Việt Nam"] });
    expect(r.map((x) => x.customerId)).toEqual([keep.id]);
  });
  it("xếp chưa liên hệ lâu nhất trước, chưa từng liên hệ đứng đầu; tính số ngày", () => {
    const a = C({ lastTouchAt: day(5) });
    const b = C({ lastTouchAt: day(90) });
    const never = C({ lastTouchAt: null });
    const r = suggestCustomers([a, b, never], opts);
    expect(r.map((x) => x.customerId)).toEqual([never.id, b.id, a.id]);
    expect(r[1]).toMatchObject({ daysSinceTouch: 90, daysSinceOrder: 30 });
    expect(r[0].daysSinceTouch).toBeNull();
  });
  it("tối đa 15 khách; chuyến không có tỉnh thì không gợi ý", () => {
    const many = Array.from({ length: 20 }, () => C({}));
    expect(suggestCustomers(many, opts)).toHaveLength(15);
    expect(suggestCustomers(many, { ...opts, provinces: [] })).toEqual([]);
  });
});
