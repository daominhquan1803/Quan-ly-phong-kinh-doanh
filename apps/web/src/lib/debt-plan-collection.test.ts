import { describe, it, expect } from "vitest";
import { classifyWeekCollections } from "./debt-plan-collection";

const d = (s: string) => new Date(`${s}T00:00:00`);
const weeks = [
  { weekIndex: 1, start: d("2026-11-01"), end: d("2026-11-08") },
  { weekIndex: 2, start: d("2026-11-09"), end: d("2026-11-15") },
  { weekIndex: 3, start: d("2026-11-16"), end: d("2026-11-22") },
  { weekIndex: 4, start: d("2026-11-23"), end: d("2026-11-29") },
  { weekIndex: 5, start: d("2026-11-30"), end: d("2026-11-30") },
];

describe("classifyWeekCollections", () => {
  it("đúng tuần hẹn: tính vào thực hiện, không phải về sớm", () => {
    const r = classifyWeekCollections(weeks, [{ amount: 100, paymentDate: d("2026-11-03"), expectedPaymentDate: d("2026-11-05") }]);
    expect(r[0]).toMatchObject({ collected: 100, early: 0, outsidePlan: 0 });
  });

  it("về sớm: tiền về tuần 1, hoá đơn hẹn tuần 3 -> tính vào thực hiện tuần 3 và dòng về sớm tuần 3", () => {
    const r = classifyWeekCollections(weeks, [{ amount: 200, paymentDate: d("2026-11-03"), expectedPaymentDate: d("2026-11-18") }]);
    expect(r[2]).toMatchObject({ collected: 200, early: 200 });
    expect(r[0].collected).toBe(0);
  });

  it("về trễ: hẹn tuần 1, về tuần 3 -> vẫn tính vào thực hiện tuần 1, không phải về sớm", () => {
    const r = classifyWeekCollections(weeks, [{ amount: 50, paymentDate: d("2026-11-17"), expectedPaymentDate: d("2026-11-04") }]);
    expect(r[0]).toMatchObject({ collected: 50, early: 0 });
  });

  it("ngoài kế hoạch: không có ngày hẹn hoặc hẹn tháng khác -> tính vào tuần tiền về", () => {
    const r = classifyWeekCollections(weeks, [
      { amount: 10, paymentDate: d("2026-11-10"), expectedPaymentDate: null },
      { amount: 20, paymentDate: d("2026-11-11"), expectedPaymentDate: d("2026-10-25") },
    ]);
    expect(r[1].outsidePlan).toBe(30);
    expect(r.reduce((s, w) => s + w.collected, 0)).toBe(0);
  });

  it("bỏ tiền về ngoài tháng và dòng không có ngày", () => {
    const r = classifyWeekCollections(weeks, [
      { amount: 5, paymentDate: d("2026-10-31"), expectedPaymentDate: d("2026-11-05") },
      { amount: 6, paymentDate: null, expectedPaymentDate: d("2026-11-05") },
    ]);
    expect(r.every((w) => w.collected === 0 && w.outsidePlan === 0)).toBe(true);
  });
});
