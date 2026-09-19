import { describe, it, expect } from "vitest";
import { fixSwappedDayMonth } from "@hoanggia/db";

const ref = new Date(2026, 8, 19); // 19/09/2026

describe("fixSwappedDayMonth", () => {
  it("đảo lại ngày bị hiểu nhầm mm/dd: 09/03 -> 03/09 khi gần thời điểm tải file", () => {
    const r = fixSwappedDayMonth(new Date(2026, 2, 9), ref); // đọc ra 9 tháng 3
    expect(r.swapped).toBe(true);
    expect(r.date).toEqual(new Date(2026, 8, 3)); // 3 tháng 9
  });

  it("ngày đã gần thời điểm tải file thì giữ nguyên (kể cả ngày = tháng như 9/9)", () => {
    expect(fixSwappedDayMonth(new Date(2026, 8, 9), ref).swapped).toBe(false);
    expect(fixSwappedDayMonth(new Date(2026, 8, 3), ref).swapped).toBe(false);
  });

  it("ngày > 12 không thể là tháng nên không đảo", () => {
    expect(fixSwappedDayMonth(new Date(2026, 2, 15), ref).swapped).toBe(false);
  });

  it("đảo lại vẫn xa thời điểm tải file thì giữ nguyên", () => {
    // 5 tháng 1 -> đảo thành 1 tháng 5: cả 2 đều xa 19/09 -> không đảo.
    expect(fixSwappedDayMonth(new Date(2026, 0, 5), ref).swapped).toBe(false);
  });
});
