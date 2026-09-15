import { describe, it, expect } from "vitest";
import { planPaymentAllocation, AllocationCandidateInvoice } from "./debt-payment-allocation";

function inv(id: string, remaining: number, invoiceNumber: string | null, daysAgo: number): AllocationCandidateInvoice {
  return { id, remaining, invoiceNumber, invoiceDate: new Date(Date.now() - daysAgo * 86400000) };
}

describe("planPaymentAllocation", () => {
  it("khớp theo số hoá đơn khi mô tả có nhắc invoice number", () => {
    const invoices = [inv("a", 1000, "00000001", 10), inv("b", 2000, "00000002", 5)];
    const plan = planPaymentAllocation({ amount: 2000, candidateInvoiceNumbers: ["00000002"] }, invoices);
    expect(plan.matchStatus).toBe("MATCHED");
    expect(plan.allocations).toEqual([{ invoiceId: "b", amount: 2000, matchMethod: "INVOICE_NUMBER" }]);
  });

  it("khớp đúng số tiền còn lại của đúng 1 hoá đơn khi không có số hoá đơn", () => {
    const invoices = [inv("a", 1000, null, 10), inv("b", 2500, null, 5)];
    const plan = planPaymentAllocation({ amount: 2500, candidateInvoiceNumbers: [] }, invoices);
    expect(plan.matchStatus).toBe("MATCHED");
    expect(plan.allocations).toEqual([{ invoiceId: "b", amount: 2500, matchMethod: "EXACT_AMOUNT" }]);
  });

  it("nhiều hoá đơn trùng số tiền -> bỏ qua khớp đúng-số-tiền, rơi xuống FIFO", () => {
    const invoices = [inv("a", 1000, null, 10), inv("b", 1000, null, 5)];
    const plan = planPaymentAllocation({ amount: 1000, candidateInvoiceNumbers: [] }, invoices);
    expect(plan.matchStatus).toBe("MATCHED");
    // hoá đơn cũ nhất (10 ngày trước) phải được trừ trước
    expect(plan.allocations).toEqual([{ invoiceId: "a", amount: 1000, matchMethod: "FIFO" }]);
  });

  it("không rõ thông tin -> trừ dần từ hoá đơn xa nhất, tràn sang hoá đơn tiếp theo nếu chưa đủ", () => {
    // Cố tình không cho tổng khớp đúng-số-tiền với bất kỳ 1 hoá đơn nào (500, 800, 1200) để chắc
    // chắn rơi xuống đúng nhánh FIFO thay vì vô tình khớp nhánh "đúng số tiền" ở trên.
    const invoices = [inv("old", 500, null, 20), inv("mid", 800, null, 10), inv("new", 1200, null, 1)];
    const plan = planPaymentAllocation({ amount: 1000, candidateInvoiceNumbers: [] }, invoices);
    expect(plan.matchStatus).toBe("MATCHED");
    expect(plan.allocations).toEqual([
      { invoiceId: "old", amount: 500, matchMethod: "FIFO" },
      { invoiceId: "mid", amount: 500, matchMethod: "FIFO" },
    ]);
  });

  it("khách không còn hoá đơn nợ nào -> UNMATCHED", () => {
    const plan = planPaymentAllocation({ amount: 1000, candidateInvoiceNumbers: [] }, []);
    expect(plan.matchStatus).toBe("UNMATCHED");
    expect(plan.allocations).toHaveLength(0);
    expect(plan.unallocatedAmount).toBe(1000);
  });

  it("số tiền vượt quá tổng nợ còn lại -> PARTIAL, phần dư không gán vào đâu", () => {
    const invoices = [inv("a", 500, null, 5)];
    const plan = planPaymentAllocation({ amount: 800, candidateInvoiceNumbers: [] }, invoices);
    expect(plan.matchStatus).toBe("PARTIAL");
    expect(plan.allocations).toEqual([{ invoiceId: "a", amount: 500, matchMethod: "FIFO" }]);
    expect(plan.unallocatedAmount).toBe(300);
  });

  it("khớp số hoá đơn nhưng tiền dư ra sau khi trả hết hoá đơn đó -> chảy tiếp sang FIFO các hoá đơn khác", () => {
    const invoices = [inv("target", 1000, "00000005", 10), inv("other", 2000, null, 20)];
    const plan = planPaymentAllocation({ amount: 1500, candidateInvoiceNumbers: ["00000005"] }, invoices);
    expect(plan.matchStatus).toBe("MATCHED");
    expect(plan.allocations).toEqual([
      { invoiceId: "target", amount: 1000, matchMethod: "INVOICE_NUMBER" },
      { invoiceId: "other", amount: 500, matchMethod: "FIFO" },
    ]);
  });
});
