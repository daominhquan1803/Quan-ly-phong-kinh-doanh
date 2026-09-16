import { describe, it, expect } from "vitest";
import { computeDebtStatus, monthWeekMonday, mondayOfWeek } from "./debt-status";

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
