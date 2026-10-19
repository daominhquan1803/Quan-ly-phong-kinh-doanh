import { describe, expect, it } from "vitest";
import { checkSeason, suggestSeasonMonths } from "./customer-season";

const d = (y: number, m: number, day = 1) => Date.UTC(y, m - 1, day);
const base = { seasonMonths: [6], leadMonths: 2, orderDates: [] as number[], careDates: [] as number[] };

describe("checkSeason (khách mua tháng 6, nhắc trước 2 tháng)", () => {
  it("chưa tới ngày nhắc thì không nhắc", () => {
    expect(checkSeason({ ...base, today: { year: 2027, month: 3, day: 31 } })).toBeNull();
  });
  it("từ 01/04 nhắc NVKD", () => {
    const r = checkSeason({ ...base, today: { year: 2027, month: 4, day: 1 } });
    expect(r).toMatchObject({ stage: "REMIND", season: "2027-06", seasonMonth: 6, daysToSeason: 61 });
  });
  it("01/05 chưa có chăm sóc thì báo Trưởng phòng (ESCALATE)", () => {
    const r = checkSeason({ ...base, today: { year: 2027, month: 5, day: 1 } });
    expect(r?.stage).toBe("ESCALATE");
  });
  it("đã chăm sóc từ 01/04 thì không nhắc nữa", () => {
    const r = checkSeason({ ...base, today: { year: 2027, month: 5, day: 10 }, careDates: [d(2027, 4, 15)] });
    expect(r).toBeNull();
  });
  it("hết tháng 6 chưa có đơn thì LỠ VỤ", () => {
    const r = checkSeason({ ...base, today: { year: 2027, month: 7, day: 2 }, careDates: [d(2027, 4, 15)] });
    expect(r?.stage).toBe("MISSED");
  });
  it("có đơn trong vụ thì đóng nhắc", () => {
    const r = checkSeason({ ...base, today: { year: 2027, month: 7, day: 2 }, orderDates: [d(2027, 6, 12)] });
    expect(r).toBeNull();
  });
  it("quá 30 ngày sau vụ thì thôi cảnh báo lỡ vụ", () => {
    expect(checkSeason({ ...base, today: { year: 2027, month: 8, day: 15 } })).toBeNull();
  });
  it("vụ tháng 1 nhắc từ tháng 11 năm trước", () => {
    const r = checkSeason({ ...base, seasonMonths: [1], today: { year: 2026, month: 11, day: 3 } });
    expect(r).toMatchObject({ stage: "REMIND", season: "2027-01" });
  });
});

describe("suggestSeasonMonths", () => {
  it("đặt tháng 6 hai năm liền, mỗi năm 1 lần -> gợi ý tháng 6", () => {
    expect(suggestSeasonMonths([d(2024, 6, 10), d(2025, 6, 12)])).toEqual([6]);
  });
  it("khách đặt đều đặn thì không gợi ý", () => {
    const dates = Array.from({ length: 12 }, (_, i) => d(2025, i + 1, 5));
    expect(suggestSeasonMonths(dates)).toEqual([]);
  });
});
