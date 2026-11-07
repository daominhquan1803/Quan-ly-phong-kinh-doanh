import { describe, it, expect } from "vitest";
import { computeDebtStatus, monthWeekMonday, mondayOfWeek, monthWeekBuckets } from "./debt-status";

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

  it("ngày 1 là Chủ nhật thì gộp vào tuần sau: 11/2026 tuần 1 là 1-8/11, tuần 5 là 30/11 (anh Quân chốt 07/11/2026)", () => {
    const buckets = monthWeekBuckets(2026, 11);
    expect(buckets.map((b) => [ymd(b.start), ymd(b.end)])).toEqual([
      ["2026-11-01", "2026-11-08"],
      ["2026-11-09", "2026-11-15"],
      ["2026-11-16", "2026-11-22"],
      ["2026-11-23", "2026-11-29"],
      ["2026-11-30", "2026-11-30"],
    ]);
    expect(ymd(monthWeekMonday(2026, 11, 1))).toBe("2026-11-02");
    expect(ymd(monthWeekMonday(2026, 11, 5))).toBe("2026-11-30");
  });

  it("tháng vẫn trải qua 6 tuần (8/2026: 1/8 là Thứ Bảy, 31/8 là Thứ Hai): gộp tuần 6 vào Tuần 5, không mất ngày 31", () => {
    const buckets = monthWeekBuckets(2026, 8);
    expect(buckets.map((b) => b.weekIndex)).toEqual([1, 2, 3, 4, 5]);
    expect(ymd(buckets[4].start)).toBe("2026-08-24");
    expect(ymd(buckets[4].end)).toBe("2026-08-31");
  });

  it("tuần giữa vẫn là tuần dương lịch đầy đủ Thứ 2 - Chủ nhật", () => {
    const buckets = monthWeekBuckets(2026, 10);
    expect(ymd(buckets[1].start)).toBe("2026-10-05");
    expect(ymd(buckets[1].end)).toBe("2026-10-11");
  });
});
