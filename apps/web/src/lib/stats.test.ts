import { describe, it, expect } from "vitest";
import {
  buildDormantCustomers,
  buildDormantItems,
  bucketOf,
  fullMonthsBetween,
  normCode,
  payStatus,
  subtractMonths,
  vnParts,
  type PoRow,
} from "./stats";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
const REF = d("2026-10-15");

const row = (o: Partial<PoRow> & { poDate: Date }): PoRow => ({
  customerCode: "C.PANASONIC",
  poCode: "PO1",
  itemCode: "A1",
  itemName: "Hàng A1",
  unit: "Cái",
  qty: 10,
  value: 1000,
  salesEmployeeId: "u1",
  ...o,
});

describe("tính tháng / mốc", () => {
  it("số tháng tròn theo lịch VN", () => {
    expect(fullMonthsBetween(d("2026-07-15"), d("2026-09-14"))).toBe(1);
    expect(fullMonthsBetween(d("2026-07-15"), d("2026-09-15"))).toBe(2);
    expect(fullMonthsBetween(d("2026-06-30"), d("2026-10-15"))).toBe(3);
    expect(fullMonthsBetween(d("2026-06-15"), d("2026-10-15"))).toBe(4);
    expect(fullMonthsBetween(d("2025-12-31"), d("2026-02-28"))).toBe(1);
  });
  it("3 mốc không chồng nhau: 2 / 3 / từ 4 tháng trở lên; dưới 2 tháng không thuộc mốc nào", () => {
    expect([1, 2, 3, 4, 7].map(bucketOf)).toEqual([null, "2", "3", "over3", "over3"]);
  });
  it("lùi tháng: kẹp ngày cuối tháng, ngày 00:00 VN", () => {
    expect(vnParts(subtractMonths(d("2026-08-31"), 6))).toEqual({ y: 2026, m: 2, d: 28 });
    expect(vnParts(subtractMonths(d("2026-03-10"), 6))).toEqual({ y: 2025, m: 9, d: 10 });
  });
  it("chuẩn hoá mã khách: bỏ tiền tố X. và dấu chấm cuối", () => {
    expect([normCode("C.PANASONIC"), normCode("MARUKOH."), normCode(" v.hienlong "), normCode("SAMSUNG")]).toEqual([
      "PANASONIC",
      "MARUKOH",
      "HIENLONG",
      "SAMSUNG",
    ]);
  });
});

describe("buildDormantCustomers", () => {
  it("chọn đúng khách theo mốc; PO cuối lấy theo ngày PO lớn nhất; gộp mã có/không tiền tố", () => {
    const rows = [
      row({ customerCode: "C.PANASONIC", poDate: d("2026-08-01") }), // 2 tháng 14 ngày -> mốc "2"
      row({ customerCode: "PANASONIC", poDate: d("2026-07-20"), poCode: "PO0" }), // cùng khách, PO cũ hơn
      row({ customerCode: "SAMSUNG", poDate: d("2026-07-10") }), // 3 tháng 5 ngày -> mốc "3"
      row({ customerCode: "ACME", poDate: d("2026-03-01") }), // 7 tháng -> over3
      row({ customerCode: "MOI", poDate: d("2026-10-01") }), // dưới 2 tháng -> bỏ
    ];
    expect(buildDormantCustomers(rows, REF, "2").map((c) => c.customerNorm)).toEqual(["PANASONIC"]);
    expect(buildDormantCustomers(rows, REF, "3").map((c) => c.customerNorm)).toEqual(["SAMSUNG"]);
    expect(buildDormantCustomers(rows, REF, "over3").map((c) => c.customerNorm)).toEqual(["ACME"]);
    const p = buildDormantCustomers(rows, REF, "2")[0];
    expect(p.lastPoDate).toEqual(d("2026-08-01"));
    expect(p.history.map((l) => l.poCode)).toEqual(["PO1", "PO0"]); // mới -> cũ, cả 2 nằm trong 6 tháng
    expect(p.daysSince).toBe(75);
  });

  it("lịch sử = 6 tháng tính lùi từ PO cuối, không sớm hơn 01/01/2026; báo hiệu khi bị cắt", () => {
    const rows = [
      row({ customerCode: "K1", poDate: d("2026-03-10"), poCode: "LAST" }),
      row({ customerCode: "K1", poDate: d("2026-01-05"), poCode: "OLD_IN" }),
      row({ customerCode: "K1", poDate: d("2025-11-01"), poCode: "BEFORE_2026" }), // trước mốc dữ liệu -> loại
      row({ customerCode: "K2", poDate: d("2026-08-31"), poCode: "K2LAST" }),
      row({ customerCode: "K2", poDate: d("2026-02-28"), poCode: "K2_EDGE" }), // đúng mép 6 tháng (31/08 lùi = 28/02) -> lấy
    ];
    const k1 = buildDormantCustomers(rows, REF, "over3").find((c) => c.customerNorm === "K1")!;
    expect(k1.history.map((l) => l.poCode)).toEqual(["LAST", "OLD_IN"]);
    expect(k1.truncated).toBe(true);
    const rows2 = [row({ customerCode: "K2", poDate: d("2026-08-31"), poCode: "K2LAST" }), row({ customerCode: "K2", poDate: d("2026-02-28"), poCode: "K2_EDGE" }), row({ customerCode: "K2", poDate: d("2026-02-27"), poCode: "K2_OUT" })];
    const k2 = buildDormantCustomers(rows2, d("2026-10-31"), "2")[0];
    expect(k2.history.map((l) => l.poCode)).toEqual(["K2LAST", "K2_EDGE"]);
    expect(k2.truncated).toBe(false);
  });

  it("bỏ PO trước 2026, PO không có mã khách; khách chỉ có PO trước 2026 không xuất hiện", () => {
    const rows = [row({ customerCode: "CU", poDate: d("2025-06-01") }), row({ customerCode: "", poDate: d("2026-03-01") })];
    expect(buildDormantCustomers(rows, REF, "over3")).toEqual([]);
  });
});

describe("buildDormantItems — theo cặp khách + mã hàng", () => {
  it("mốc tính theo lần mua cuối của CHÍNH mã hàng đó của khách đó, không phải của khách", () => {
    const rows = [
      row({ customerCode: "C.PANASONIC", itemCode: "A1", poDate: d("2026-10-10") }), // A1 mới mua
      row({ customerCode: "C.PANASONIC", itemCode: "B2", itemName: "Hàng B2", poDate: d("2026-08-01"), qty: 5, value: 500 }), // B2: mốc "2"
      row({ customerCode: "C.PANASONIC", itemCode: "B2", poDate: d("2026-07-20"), poCode: "PO0", qty: 7, value: 700 }),
      row({ customerCode: "SAMSUNG", itemCode: "B2", poDate: d("2026-08-02") }), // khách khác, cặp khác
      row({ customerCode: "C.PANASONIC", itemCode: null, poDate: d("2026-08-01") }), // không mã hàng -> bỏ
    ];
    const r = buildDormantItems(rows, REF, "2");
    expect(r.map((x) => `${x.customerNorm}/${x.itemCode}`).sort()).toEqual(["PANASONIC/B2", "SAMSUNG/B2"]);
    const pb = r.find((x) => x.customerNorm === "PANASONIC")!;
    expect(pb.history.map((l) => [l.poCode, l.qty, l.value])).toEqual([["PO1", 5, 500], ["PO0", 7, 700]]);
    expect(buildDormantItems(rows, REF, "over3")).toEqual([]);
  });
});

describe("payStatus", () => {
  it("đã / một phần / chưa", () => {
    expect(payStatus(1000, 1000)).toBe("PAID");
    expect(payStatus(1000, 999.7)).toBe("PAID"); // lệch làm tròn
    expect(payStatus(1000, 400)).toBe("PARTIAL");
    expect(payStatus(1000, 0)).toBe("UNPAID");
  });
});
