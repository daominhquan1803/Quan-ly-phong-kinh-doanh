// Phân loại tiền về trong tháng theo kế hoạch thu tuần (trang Công nợ > Kế hoạch thu).
//  - Thực hiện tuần N  = tiền đã về trong tháng của các hoá đơn NVKD hẹn thu ở tuần N (kể cả về sớm hay trễ hơn tuần hẹn).
//  - Về sớm tuần N     = phần của "thực hiện" đã về TRƯỚC tuần N.
//  - Ngoài kế hoạch    = tiền về trong tuần N của hoá đơn không hẹn trong tháng này (chưa đăng ký, hoặc hẹn tháng khác;
//                        khoản hẹn tháng trước mà trượt thì NVKD đăng ký lại sang tháng này nên đã thuộc kế hoạch).
// Chỉ tính tiền về có ngày nằm trong tháng đang xem.
export interface WeekBucket {
  weekIndex: number;
  start: Date;
  end: Date;
}

export interface AllocationForPlan {
  amount: number;
  paymentDate: Date | null;
  expectedPaymentDate: Date | null;
}

export interface WeekCollection {
  weekIndex: number;
  collected: number;
  early: number;
  outsidePlan: number;
}

export function classifyWeekCollections(weeks: WeekBucket[], allocations: AllocationForPlan[]): WeekCollection[] {
  const out: WeekCollection[] = weeks.map((w) => ({ weekIndex: w.weekIndex, collected: 0, early: 0, outsidePlan: 0 }));
  const idxOf = (d: Date) => weeks.findIndex((w) => d >= w.start && d <= w.end);
  for (const a of allocations) {
    if (!a.paymentDate) continue;
    const pay = idxOf(a.paymentDate);
    if (pay < 0) continue; // tiền về ngoài tháng đang xem
    const plan = a.expectedPaymentDate ? idxOf(new Date(a.expectedPaymentDate)) : -1;
    if (plan >= 0) {
      out[plan].collected += a.amount;
      if (pay < plan) out[plan].early += a.amount;
    } else {
      out[pay].outsidePlan += a.amount;
    }
  }
  return out;
}
