// Kế hoạch thu tuần + phân loại tiền về trong tháng (trang Công nợ > Kế hoạch thu).
//
// Mỗi hoá đơn thuộc kế hoạch có "tuần hẹn" P và số tiền A (originalAmount). Kế hoạch từng tuần được CUỐN CHIẾU (anh Quân chốt 14/11/2026):
//  - Tuần N < P : hoá đơn chưa vào kế hoạch tuần N. Tiền về ở tuần N là "VỀ SỚM": hiện ở ô tuần N (tuần tiền về).
//  - Tuần N = P : kế hoạch = A trừ phần đã về sớm (tiền về trước tuần P).
//  - Tuần N > P : kế hoạch = phần còn thiếu sau khi hết tuần N-1 (A trừ mọi khoản đã về đến hết tuần N-1) — khoản TRƯỢT được đẩy sang
//                 tuần sau, tuần nào chưa thu xong thì tiếp tục đẩy. Chỉ đẩy sang tuần đã bắt đầu (tuần chưa tới chưa biết có trượt hay không).
//  - Thực hiện tuần N = tiền về ở tuần N của các hoá đơn có P <= N (đúng hẹn hoặc thu bù khoản trượt).
//  - Ngoài kế hoạch   = tiền về ở tuần N của hoá đơn không thuộc kế hoạch tháng này.
// Số CẢ THÁNG không cuốn chiếu: kế hoạch = tổng A (kế hoạch gốc), đã thu = thực hiện + về sớm của mọi tuần.
//
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
  /** Kế hoạch thu của tuần sau khi cuốn chiếu = plannedOriginal − earlyDeducted + carried. */
  planned: number;
  /** Kế hoạch gốc: các hoá đơn hẹn thu đúng tuần này. */
  plannedOriginal: number;
  /** Phần của kế hoạch gốc tuần này đã về sớm ở các tuần trước (được trừ khỏi kế hoạch tuần này). */
  earlyDeducted: number;
  /** Khoản trượt từ các tuần trước đẩy sang tuần này. */
  carried: number;
  /** Thực hiện: tiền về tuần này của hoá đơn hẹn tuần này hoặc các tuần trước. */
  collected: number;
  /** Về sớm: tiền về tuần này của hoá đơn hẹn các tuần SAU. */
  early: number;
  outsidePlan: number;
}

export function buildWeekPlan(weeks: WeekBucket[], invoices: InvoiceForPlan[], asOf: Date = new Date()): WeekPlanResult[] {
  const out: WeekPlanResult[] = weeks.map((w) => ({
    weekIndex: w.weekIndex,
    planned: 0,
    plannedOriginal: 0,
    earlyDeducted: 0,
    carried: 0,
    collected: 0,
    early: 0,
    outsidePlan: 0,
  }));
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

    if (planIdx < 0 && paid.length > 0) {
      // Chưa hẹn trong tháng nhưng đã thu trong tháng.
      const eff = exp ?? (inv.dueDate ? new Date(inv.dueDate) : null);
      if (eff && eff < first) {
        planIdx = Math.min(...paid.map((a) => a.pay)); // trượt từ tháng trước: coi như thu đúng tuần tiền về
      } else if (eff && !exp && eff <= last) {
        planIdx = idxOf(eff);
      }
    }

    if (planIdx < 0) {
      for (const a of paid) out[a.pay].outsidePlan += a.amount;
      continue;
    }

    const paidThrough = (w: number) => paid.reduce((s, a) => (a.pay <= w ? s + a.amount : s), 0);
    const amount = inv.originalAmount;

    // Tuần hẹn: kế hoạch gốc trừ phần đã về sớm.
    const earlyBefore = Math.min(amount, paidThrough(planIdx - 1));
    out[planIdx].plannedOriginal += amount;
    out[planIdx].earlyDeducted += earlyBefore;
    out[planIdx].planned += amount - earlyBefore;

    // Các tuần sau (đã bắt đầu): khoản còn thiếu sau tuần trước được đẩy sang.
    for (let n = planIdx + 1; n < weeks.length; n++) {
      if (weeks[n].start > asOf) break; // tuần chưa tới: chưa biết có trượt hay không
      const outstanding = Math.max(0, amount - paidThrough(n - 1));
      out[n].carried += outstanding;
      out[n].planned += outstanding;
    }

    for (const a of paid) {
      if (a.pay >= planIdx) out[a.pay].collected += a.amount;
      else out[a.pay].early += a.amount;
    }
  }
  return out;
}
