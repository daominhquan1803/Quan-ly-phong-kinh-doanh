// Kế hoạch thu tuần + phân loại tiền về trong tháng (trang Công nợ > Kế hoạch thu).
//  - Kế hoạch tuần N   = hoá đơn NVKD hẹn thu ở tuần N, cộng hoá đơn đã thu trong tháng mà NVKD không kịp đăng ký (xem dưới).
//  - Thực hiện tuần N  = tiền đã về trong tháng của các hoá đơn thuộc kế hoạch tuần N (kể cả về sớm hay trễ hơn tuần hẹn).
//  - Về sớm tuần N     = phần của "thực hiện" đã về TRƯỚC tuần N.
//  - Ngoài kế hoạch    = tiền về trong tuần N của hoá đơn không thuộc kế hoạch tháng này.
// Hoá đơn thu trong tháng mà chưa hẹn trong tháng:
//  - hẹn tháng trước mà trượt, về tháng này     -> vào kế hoạch đúng tuần tiền về (tính là thu đúng kế hoạch);
//  - chưa có ngày hẹn (khách trả trước hạn nên NVKD chưa kịp điền) -> lấy NGÀY HẠN NỢ làm ngày kế hoạch: hạn trong tháng thì
//    vào tuần của hạn nợ (tiền về trước đó là "về sớm"), hạn trước tháng thì như hẹn trượt, hạn sau tháng hoặc không có hạn thì
//    ngoài kế hoạch;
//  - hẹn sang tháng sau                            -> ngoài kế hoạch.
// Chỉ tính tiền về có ngày nằm trong tháng đang xem.
export interface WeekBucket {
  weekIndex: number;
  start: Date;
  end: Date;
}

export interface InvoiceForPlan {
  originalAmount: number;
  expectedPaymentDate: Date | null;
  dueDate: Date | null;
  allocations: { amount: number; paymentDate: Date | null }[];
}

export interface WeekPlanResult {
  weekIndex: number;
  planned: number;
  collected: number;
  early: number;
  outsidePlan: number;
}

export function buildWeekPlan(weeks: WeekBucket[], invoices: InvoiceForPlan[]): WeekPlanResult[] {
  const out: WeekPlanResult[] = weeks.map((w) => ({ weekIndex: w.weekIndex, planned: 0, collected: 0, early: 0, outsidePlan: 0 }));
  const first = weeks[0]?.start;
  const last = weeks[weeks.length - 1]?.end;
  if (!first || !last) return out;
  const idxOf = (d: Date) => weeks.findIndex((w) => d >= w.start && d <= w.end);

  for (const inv of invoices) {
    const paid = inv.allocations
      .map((a) => ({ amount: a.amount, pay: a.paymentDate ? idxOf(a.paymentDate) : -1 }))
      .filter((a) => a.pay >= 0);
    const exp = inv.expectedPaymentDate ? new Date(inv.expectedPaymentDate) : null;
    let planIdx = exp ? idxOf(exp) : -1;

    if (planIdx >= 0) {
      out[planIdx].planned += inv.originalAmount;
    } else if (paid.length > 0) {
      // Chưa hẹn trong tháng nhưng đã thu trong tháng.
      const eff = exp ?? (inv.dueDate ? new Date(inv.dueDate) : null);
      if (eff && eff < first) {
        planIdx = Math.min(...paid.map((a) => a.pay)); // trượt từ tháng trước: coi như thu đúng tuần tiền về
      } else if (eff && !exp && eff <= last) {
        planIdx = idxOf(eff);
      }
      if (planIdx >= 0) out[planIdx].planned += inv.originalAmount;
    }

    for (const a of paid) {
      if (planIdx >= 0) {
        out[planIdx].collected += a.amount;
        if (a.pay < planIdx) out[planIdx].early += a.amount;
      } else {
        out[a.pay].outsidePlan += a.amount;
      }
    }
  }
  return out;
}
