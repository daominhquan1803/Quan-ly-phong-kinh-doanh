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
const END = d("2026-12-31"); // đã qua hết tháng: mọi tuần đều đã bắt đầu
const BEFORE = d("2026-10-01"); // chưa tuần nào bắt đầu: không đẩy khoản trượt

function inv(o: { amount?: number; expected?: string | null; due?: string | null; pays?: [number, string | null][] }): InvoiceForPlan {
  return {
    originalAmount: o.amount ?? 100,
    expectedPaymentDate: o.expected ? d(o.expected) : null,
    dueDate: o.due ? d(o.due) : null,
    allocations: (o.pays ?? []).map(([amount, date]) => ({ amount, paymentDate: date ? d(date) : null })),
  };
}

describe("buildWeekPlan — đúng hẹn, về sớm, trượt", () => {
  it("đúng tuần hẹn: vào kế hoạch và thực hiện, không về sớm, không trượt", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-05", pays: [[100, "2026-11-03"]] })], END);
    expect(r[0]).toMatchObject({ planned: 100, plannedOriginal: 100, earlyDeducted: 0, carried: 0, collected: 100, early: 0 });
    expect(r.slice(1).every((w) => w.planned === 0 && w.carried === 0)).toBe(true);
  });

  it("về sớm: tiền về tuần 1, hẹn tuần 3 -> về sớm hiện ở tuần 1; kế hoạch tuần 3 trừ đi khoản đó", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-18", pays: [[100, "2026-11-03"]] })], END);
    expect(r[0]).toMatchObject({ planned: 0, collected: 0, early: 100 });
    expect(r[2]).toMatchObject({ plannedOriginal: 100, earlyDeducted: 100, planned: 0, collected: 0, early: 0 });
  });

  it("về sớm một phần: hẹn tuần 2 trả 40 ở tuần 1 -> tuần 1 về sớm 40; tuần 2 kế hoạch còn 60", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-12", pays: [[40, "2026-11-03"], [60, "2026-11-13"]] })], END);
    expect(r[0]).toMatchObject({ early: 40, planned: 0 });
    expect(r[1]).toMatchObject({ plannedOriginal: 100, earlyDeducted: 40, planned: 60, collected: 60 });
    expect(r[2].carried).toBe(0);
  });

  it("về trễ: hẹn tuần 1, về tuần 3 -> khoản trượt đẩy sang tuần 2 rồi tuần 3; thực hiện tính ở tuần 3", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-04", pays: [[100, "2026-11-17"]] })], END);
    expect(r[0]).toMatchObject({ planned: 100, collected: 0 });
    expect(r[1]).toMatchObject({ carried: 100, planned: 100, collected: 0 });
    expect(r[2]).toMatchObject({ carried: 100, planned: 100, collected: 100, early: 0 });
    expect(r[3].carried).toBe(0);
  });

  it("trượt một phần: thu 30 ở tuần 1, 20 ở tuần 2 -> phần còn thiếu tiếp tục đẩy sang các tuần sau", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-04", pays: [[30, "2026-11-03"], [20, "2026-11-10"]] })], END);
    expect(r[0]).toMatchObject({ planned: 100, collected: 30 });
    expect(r[1]).toMatchObject({ carried: 70, planned: 70, collected: 20 });
    expect(r[2]).toMatchObject({ carried: 50, planned: 50 });
    expect(r[3]).toMatchObject({ carried: 50, planned: 50 });
    expect(r[4]).toMatchObject({ carried: 50, planned: 50 });
  });

  it("chỉ đẩy khoản trượt sang tuần đã bắt đầu; tuần chưa tới giữ kế hoạch gốc", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-04" })], d("2026-11-14"));
    expect(r[0].planned).toBe(100);
    expect(r[1]).toMatchObject({ carried: 100, planned: 100 }); // tuần 2 đã bắt đầu (9/11)
    expect(r[2]).toMatchObject({ carried: 0, planned: 0 }); // tuần 3 bắt đầu 16/11 — chưa tới
  });

  it("chưa tuần nào bắt đầu (xem tháng tương lai): không đẩy khoản trượt", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-11-04" })], BEFORE);
    expect(r.map((w) => w.planned)).toEqual([100, 0, 0, 0, 0]);
  });

  it("số cả tháng không bị nhân lên: tổng kế hoạch gốc, tổng thu = thực hiện + về sớm", () => {
    const r = buildWeekPlan(
      weeks,
      [inv({ expected: "2026-11-04", pays: [[100, "2026-11-17"]] }), inv({ expected: "2026-11-18", pays: [[50, "2026-11-03"]] })],
      END
    );
    expect(r.reduce((s, w) => s + w.plannedOriginal, 0)).toBe(200);
    expect(r.reduce((s, w) => s + w.collected + w.early, 0)).toBe(150);
    expect(r.reduce((s, w) => s + w.early, 0)).toBe(50);
  });
});

describe("buildWeekPlan — bảng kê từng tuần cộng ra đúng kế hoạch của tuần", () => {
  it("các dòng (hẹn đúng tuần + trượt từ tuần trước) cộng bằng planned; dòng trượt ghi tuần hẹn gốc", () => {
    const invoices = [
      { ...inv({ expected: "2026-11-04", amount: 100, pays: [[30, "2026-11-03"]] }), id: "a" }, // trượt 70 sang tuần 2 trở đi
      { ...inv({ expected: "2026-11-12", amount: 200, pays: [[50, "2026-11-03"]] }), id: "b" }, // về sớm 50 ở tuần 1
      { ...inv({ expected: "2026-11-13", amount: 40 }), id: "c" },
    ];
    const r = buildWeekPlan(weeks, invoices, END);
    for (const w of r) expect(w.lines.reduce((s, l) => s + l.amount, 0)).toBe(w.planned);
    expect(r[1].lines.map((l) => [l.id, l.kind, l.fromWeek, l.amount])).toEqual([
      ["a", "carried", 1, 70],
      ["b", "planned", 2, 150],
      ["c", "planned", 2, 40],
    ]);
    expect(r[1].lines.find((l) => l.id === "b")?.earlyDeducted).toBe(50);
  });
});

describe("buildWeekPlan — chỉ tính giá trị còn lại chưa thu tại đầu tháng", () => {
  it("hoá đơn đã thu 1 phần từ tháng trước: kế hoạch chỉ là phần còn lại", () => {
    const i = { ...inv({ expected: "2026-11-12", amount: 100, pays: [[60, "2026-11-13"]] }), paidAmount: 100 }; // 40 đã thu từ trước + 60 thu tháng này
    const r = buildWeekPlan(weeks, [i], END);
    expect(r[1]).toMatchObject({ plannedOriginal: 60, planned: 60, collected: 60 });
  });

  it("đã thu trước tháng nhưng chưa thu tiếp: phần còn lại trượt sang tuần sau", () => {
    const i = { ...inv({ expected: "2026-11-04", amount: 100 }), paidAmount: 40 };
    const r = buildWeekPlan(weeks, [i], END);
    expect(r[0].planned).toBe(60);
    expect(r[1]).toMatchObject({ carried: 60, planned: 60 });
  });

  it("khoản về từ đầu tháng không bị tính là đã thu trước tháng (không trừ 2 lần)", () => {
    const i = { ...inv({ expected: "2026-11-04", amount: 100, pays: [[30, "2026-11-03"]] }), paidAmount: 30 };
    const r = buildWeekPlan(weeks, [i], END);
    expect(r[0]).toMatchObject({ plannedOriginal: 100, collected: 30 });
  });

  it("hoá đơn đã thu đủ từ trước tháng không vào kế hoạch", () => {
    const i = { ...inv({ expected: "2026-11-04", amount: 100, pays: [[5, "2026-11-10"]] }), paidAmount: 105 };
    const r = buildWeekPlan(weeks, [i], END);
    expect(r.reduce((s, w) => s + w.planned, 0)).toBe(0);
    expect(r[1].outsidePlan).toBe(5);
  });
});

describe("buildWeekPlan — hoá đơn chưa hẹn trong tháng", () => {
  it("hẹn tháng trước mà trượt, về tháng này -> vào kế hoạch đúng tuần tiền về", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-10-31", due: "2026-11-14", pays: [[100, "2026-11-04"]] })], END);
    expect(r[0]).toMatchObject({ planned: 100, collected: 100, early: 0, outsidePlan: 0 });
  });

  it("chưa có ngày hẹn, hạn nợ trong tháng -> kế hoạch theo hạn nợ; về trước hạn là về sớm ở tuần tiền về", () => {
    const r = buildWeekPlan(weeks, [inv({ due: "2026-11-25", pays: [[100, "2026-11-04"]] })], END);
    expect(r[0]).toMatchObject({ early: 100 });
    expect(r[3]).toMatchObject({ plannedOriginal: 100, earlyDeducted: 100, planned: 0 });
  });

  it("chưa có ngày hẹn, hạn nợ trước tháng -> coi như trượt, vào kế hoạch tuần tiền về", () => {
    const r = buildWeekPlan(weeks, [inv({ due: "2026-10-24", pays: [[100, "2026-11-04"]] })], END);
    expect(r[0]).toMatchObject({ planned: 100, collected: 100, early: 0 });
  });

  it("chưa có ngày hẹn, hạn nợ sau tháng hoặc không có hạn -> ngoài kế hoạch", () => {
    const r = buildWeekPlan(
      weeks,
      [inv({ due: "2026-12-10", pays: [[10, "2026-11-10"]] }), inv({ pays: [[20, "2026-11-11"]] })],
      END
    );
    expect(r[1]).toMatchObject({ planned: 0, collected: 0, outsidePlan: 30 });
  });

  it("hẹn sang tháng sau -> ngoài kế hoạch, không dùng hạn nợ", () => {
    const r = buildWeekPlan(weeks, [inv({ expected: "2026-12-05", due: "2026-11-20", pays: [[100, "2026-11-10"]] })], END);
    expect(r[1]).toMatchObject({ planned: 0, outsidePlan: 100 });
  });

  it("hoá đơn chưa thu và không hẹn trong tháng không vào kế hoạch; tiền ngoài tháng và dòng không ngày bị bỏ", () => {
    const r = buildWeekPlan(
      weeks,
      [inv({ due: "2026-11-20" }), inv({ expected: "2026-11-05", pays: [[5, "2026-10-31"], [6, null]] })],
      BEFORE
    );
    expect(r.reduce((s, w) => s + w.planned, 0)).toBe(100);
    expect(r.every((w) => w.collected === 0 && w.early === 0 && w.outsidePlan === 0)).toBe(true);
  });
});
