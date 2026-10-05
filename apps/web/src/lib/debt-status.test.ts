import { describe, it, expect } from "vitest";
import { computeDebtStatus, monthWeekMonday, mondayOfWeek, monthWeekBuckets, previousMonthRange, isSlippedFromPrevMonth } from "./debt-status";

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

describe("computeDebtStatus", () => {
  it("hết nợ (remaining<=0) -> PAID, không còn là CURRENT", () => {
    const status = computeDebtStatus({ dueDate: new Date(2020, 0, 1), originalAmount: 1000, paidAmount: 1000 });
    expect(status).toBe("PAID");
  });
});

describe("monthWeekMonday", () => {
  it("tuần 1 = tuần dương lịch chứa ngày 1 đầu tháng", () => {
    // Tháng 9/2026: ngày 1 là Thứ 3 -> tuần chứa nó bắt đầu Thứ 2 31/08/2026.
    const w1 = monthWeekMonday(2026, 9, 1);
    expect(w1).toEqual(mondayOfWeek(new Date(2026, 8, 1)));
  });

  it("tuần N nối tiếp mỗi 7 ngày từ tuần 1", () => {
    const w1 = monthWeekMonday(2026, 9, 1);
    const w3 = monthWeekMonday(2026, 9, 3);
    const diffDays = (w3.getTime() - w1.getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBe(14);
  });
});

describe("monthWeekBuckets", () => {
  it("tuần 1 CẮT đúng ngày 1 đầu tháng, không lấy phần cuối tháng trước (tháng 10/2026, Thứ 2 của tuần là 28/09)", () => {
    const buckets = monthWeekBuckets(2026, 10);
    expect(ymd(buckets[0].start)).toBe("2026-10-01");
    expect(ymd(buckets[0].end)).toBe("2026-10-04");
  });

  it("tuần cuối CẮT đúng ngày cuối tháng, không tràn sang tháng sau (tháng 9/2026, Chủ nhật của tuần là 04/10)", () => {
    const buckets = monthWeekBuckets(2026, 9);
    const last = buckets[buckets.length - 1];
    expect(ymd(last.start)).toBe("2026-09-28");
    expect(ymd(last.end)).toBe("2026-09-30");
  });

  it("tuần giữa vẫn là tuần dương lịch đầy đủ Thứ 2 - Chủ nhật", () => {
    const buckets = monthWeekBuckets(2026, 10);
    expect(ymd(buckets[1].start)).toBe("2026-10-05");
    expect(ymd(buckets[1].end)).toBe("2026-10-11");
  });
});

describe("trượt kế hoạch tháng trước", () => {
  const prev = previousMonthRange(2026, 10); // tháng 9/2026
  it("previousMonthRange: 01/09 -> 30/09, nhãn 09/2026; tháng 1 lùi sang 12 năm trước", () => {
    expect(ymd(prev.start)).toBe("2026-09-01");
    expect(ymd(prev.end)).toBe("2026-09-30");
    expect(prev.label).toBe("09/2026");
    expect(previousMonthRange(2026, 1).label).toBe("12/2025");
  });
  it("hẹn thu trong tháng trước + còn nợ -> trượt (kể cả đúng ngày 30/09 và 01/09)", () => {
    expect(isSlippedFromPrevMonth(new Date(2026, 8, 30), 100, prev)).toBe(true);
    expect(isSlippedFromPrevMonth(new Date(2026, 8, 1), 100, prev)).toBe(true);
  });
  it("không trượt: đã thu hết, hẹn tháng khác, hoặc chưa có ngày hẹn", () => {
    expect(isSlippedFromPrevMonth(new Date(2026, 8, 15), 0, prev)).toBe(false);
    expect(isSlippedFromPrevMonth(new Date(2026, 9, 1), 100, prev)).toBe(false);
    expect(isSlippedFromPrevMonth(new Date(2026, 7, 31), 100, prev)).toBe(false);
    expect(isSlippedFromPrevMonth(null, 100, prev)).toBe(false);
  });
});
