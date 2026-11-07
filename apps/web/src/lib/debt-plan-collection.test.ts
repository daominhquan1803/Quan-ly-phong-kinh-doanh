import { describe, it, expect } from "vitest";
import { buildWeekPlan, type InvoiceForPlan } from "./debt-plan-collection";

const d = (s: string) => new Date(`${s}T00:00:00`);
const weeks = [
  { weekIndex: 1, start: d("2026-11-01"), end: d("2026-11-08") },
  { weekIndex: 2, start: d("2026-11-09"), end: d("2026-11-15") },
  { weekIndex: 3, start: d("2026-11-16"), end: d("2026-11-22") },
  { weekIndex: 4, start: d("2026-11-23"), end: d("2026-11-29") },
  { weekIndex: 5, start: d("2026-11-30"), end: d("2026-11-30") },
];

function inv(o: { amount?: number; expected?: string | null; due?: string | null; pays?: [number, string | null][] }): InvoiceForPlan {
  return {
    originalAmount: o.amount ?? 100,
    expectedPaymentDate: o.expected ? d(o.expected) : null,
    dueDate: o.due ? d(o.due) : null,
    allocations: (o.pays ?? []).map(([amount, date]) => ({ amount, paymentDate: date ? d(date) : null })),
  };
}

describe("buildWeekPlan", () => {
  it("đúng tuần hẹn: vào kế hoạch và thực hiện, không phải về sớm", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-05", pays: [[100, "2026-11-03"]] })]);
    expect(r[0]).toMatchObject({ planned: 100, collected: 100, early: 0, outsidePlan: 0 });
  });

  it("về sớm: tiền về tuần 1, hẹn tuần 3 -> thực hiện + về sớm ở tuần 3", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-18", pays: [[100, "2026-11-03"]] })]);
    expect(r[2]).toMatchObject({ planned: 100, collected: 100, early: 100 });
    expect(r[0]).toMatchObject({ planned: 0, collected: 0 });
  });

  it("về trễ: hẹn tuần 1, về tuần 3 -> vẫn thực hiện tuần 1, không phải về sớm", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-04", pays: [[100, "2026-11-17"]] })]);
    expect(r[0]).toMatchObject({ collected: 100, early: 0 });
  });

  it("hẹn tháng trước mà trượt, về tháng này -> vào kế hoạch đúng tuần tiền về", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-10-31", due: "2026-11-14", pays: [[100, "2026-11-04"]] })]);
    expect(r[0]).toMatchObject({ planned: 100, collected: 100, early: 0, outsidePlan: 0 });
  });

  it("chưa có ngày hẹn, hạn nợ trong tháng -> kế hoạch theo hạn nợ, về trước hạn là về sớm", () => {
    const r = buildWeekPlan(weeks, [inv({ due: "2026-11-25", pays: [[100, "2026-11-04"]] })]);
    expect(r[3]).toMatchObject({ planned: 100, collected: 100, early: 100 });
  });

  it("chưa có ngày hẹn, hạn nợ trước tháng -> coi như trượt, vào kế hoạch tuần tiền về", () => {
    const r = buildWeekPlan(weeks, [inv({ due: "2026-10-24", pays: [[100, "2026-11-04"]] })]);
    expect(r[0]).toMatchObject({ planned: 100, collected: 100, early: 0 });
  });

  it("chưa có ngày hẹn, hạn nợ sau tháng hoặc không có hạn -> ngoài kế hoạch", () => {
    const r = buildWeekPlan(weeks, [
      inv({ due: "2026-12-10", pays: [[10, "2026-11-10"]] }),
      inv({ pays: [[20, "2026-11-11"]] }),
    ]);
    expect(r[1]).toMatchObject({ planned: 0, collected: 0, outsidePlan: 30 });
  });

  it("hẹn sang tháng sau -> ngoài kế hoạch, không dùng hạn nợ", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-12-05", due: "2026-11-20", pays: [[100, "2026-11-10"]] })]);
    expect(r[1]).toMatchObject({ planned: 0, outsidePlan: 100 });
  });

  it("hoá đơn chưa thu và không hẹn trong tháng không vào kế hoạch; tiền ngoài tháng và dòng không ngày bị bỏ", () => {
    const r = buildWeekPlan(weeks, [
      inv({ due: "2026-11-20" }),
      inv({ expected: "2026-11-05", pays: [[5, "2026-10-31"], [6, null]] }),
    ]);
    expect(r.reduce((s, w) => s + w.planned, 0)).toBe(100);
    expect(r.every((w) => w.collected === 0 && w.outsidePlan === 0)).toBe(true);
  });
});
