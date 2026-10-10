import { describe, it, expect, vi } from "vitest";

vi.mock("@hoanggia/db", () => ({ prisma: {} }));

import { computeFollowUp, type FollowUpInput } from "./debt-followup";

const d = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`);
// Tuần 05/10 (T2) - 11/10 (CN) năm 2026
const WEEK = d("2026-10-07");
const NOW = d("2026-10-08");

const inv = (o: Partial<FollowUpInput>): FollowUpInput => ({
  id: "i", invoiceNumber: "HD1", customerCode: "KH", customerName: "Khach", invoiceDate: d("2026-08-01"),
  originalAmount: 1000, paidAmount: 0, expectedPaymentDate: d("2026-10-07"), salesEmployeeId: "u1", employeeName: "Tùng",
  allocations: [], ...o,
});

describe("computeFollowUp", () => {
  it("phân loại kế hoạch tuần / trượt (gộp nhiều tuần), bỏ HĐ hẹn tuần sau và HĐ không có ngày dự kiến", () => {
    const r = computeFollowUp(
      [
        inv({ id: "a", expectedPaymentDate: d("2026-10-05") }), // đầu tuần -> kế hoạch tuần
        inv({ id: "b", expectedPaymentDate: d("2026-10-11") }), // chủ nhật -> kế hoạch tuần
        inv({ id: "c", expectedPaymentDate: d("2026-10-02") }), // tuần trước -> trượt 1
        inv({ id: "d", expectedPaymentDate: d("2026-09-14") }), // 3 tuần trước -> trượt 3
        inv({ id: "e", expectedPaymentDate: d("2026-10-12") }), // tuần sau -> bỏ
        inv({ id: "f", expectedPaymentDate: null }), // chưa có lịch -> bỏ
      ],
      WEEK,
      NOW
    );
    expect(r.isCurrentWeek).toBe(true);
    expect(r.weekStart).toEqual(d("2026-10-05"));
    expect(r.totals).toMatchObject({ plannedAmount: 2000, plannedCount: 2, slippedAmount: 2000, slippedCount: 2, total: 4000 });
    expect(r.invoices.map((i) => [i.id, i.kind, i.slippedWeeks])).toEqual([
      ["d", "slipped", 3], ["c", "slipped", 1], ["a", "planned", 0], ["b", "planned", 0],
    ]);
  });

  it("số tiền = còn nợ tại đầu tuần: trừ tiền về trước thứ 2 + phần nhập thẳng từ file gốc; đã thu = tiền về trong tuần", () => {
    const r = computeFollowUp(
      [
        inv({
          id: "a", originalAmount: 1000, paidAmount: 500 + 100 + 200, // 500 file gốc, 100 trước tuần, 200 trong tuần
          allocations: [{ amount: 100, paymentDate: d("2026-10-02") }, { amount: 200, paymentDate: d("2026-10-06") }],
        }),
        inv({ id: "paid", originalAmount: 1000, paidAmount: 1000, allocations: [{ amount: 1000, paymentDate: d("2026-10-01") }] }), // thu hết trước tuần -> bỏ
        inv({ id: "later", expectedPaymentDate: d("2026-09-20"), invoiceDate: d("2026-10-20") }), // chứng từ phát sinh sau tuần -> bỏ
      ],
      WEEK,
      NOW
    );
    expect(r.invoices).toHaveLength(1);
    expect(r.invoices[0]).toMatchObject({ openAtStart: 400, collected: 200, remaining: 200 });
  });

  it("gộp theo nhân viên; HĐ chưa gán -> (Chưa gán); tuần quá khứ không phải tuần hiện tại", () => {
    const r = computeFollowUp(
      [
        inv({ id: "a", salesEmployeeId: "u1", employeeName: "Tùng" }),
        inv({ id: "b", salesEmployeeId: "u1", employeeName: "Tùng", expectedPaymentDate: d("2026-09-30") }),
        inv({ id: "c", salesEmployeeId: null, employeeName: "(Chưa gán)" }),
      ],
      d("2026-10-07"),
      d("2026-10-20")
    );
    expect(r.isCurrentWeek).toBe(false);
    expect(r.rows.find((x) => x.employeeId === "u1")).toMatchObject({ plannedCount: 1, slippedCount: 1, total: 2000 });
    expect(r.rows.find((x) => x.employeeId === "")?.employeeName).toBe("(Chưa gán)");
  });
});
