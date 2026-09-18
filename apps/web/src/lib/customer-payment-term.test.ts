import { describe, it, expect } from "vitest";
import { computeDueDateFromTerm } from "./customer-payment-term";

describe("computeDueDateFromTerm", () => {
  it("DAYS_FROM_INVOICE: cộng thẳng số ngày vào ngày chứng từ", () => {
    const due = computeDueDateFromTerm(new Date(2026, 8, 1), {
      paymentTermType: "DAYS_FROM_INVOICE",
      paymentTermDays: 30,
      paymentTermMonthOffset: null,
    });
    expect(due).toEqual(new Date(2026, 8, 31));
  });

  it("END_OF_MONTH_OFFSET: cuối tháng thứ N+offset kể từ tháng chứng từ", () => {
    // Hoá đơn tháng 9/2026, offset 2 -> hạn = cuối tháng 11/2026.
    const due = computeDueDateFromTerm(new Date(2026, 8, 15), {
      paymentTermType: "END_OF_MONTH_OFFSET",
      paymentTermDays: null,
      paymentTermMonthOffset: 2,
    });
    expect(due).toEqual(new Date(2026, 10, 30));
  });

  it("thiếu invoiceDate hoặc chưa có quy tắc -> null", () => {
    expect(computeDueDateFromTerm(null, { paymentTermType: "DAYS_FROM_INVOICE", paymentTermDays: 30, paymentTermMonthOffset: null })).toBeNull();
    expect(computeDueDateFromTerm(new Date(2026, 8, 1), { paymentTermType: null, paymentTermDays: null, paymentTermMonthOffset: null })).toBeNull();
  });
});
