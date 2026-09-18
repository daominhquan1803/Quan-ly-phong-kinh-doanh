export type PaymentTermType = "DAYS_FROM_INVOICE" | "END_OF_MONTH_OFFSET";

export const PAYMENT_TERM_TYPE_LABEL: Record<PaymentTermType, string> = {
  DAYS_FROM_INVOICE: "Số ngày kể từ ngày chứng từ",
  END_OF_MONTH_OFFSET: "Cuối tháng thứ N+x kể từ tháng chứng từ",
};

export interface PaymentTerm {
  paymentTermType: PaymentTermType | null;
  paymentTermDays: number | null;
  paymentTermMonthOffset: number | null;
}

/** Tính hạn thanh toán (dueDate) từ Ngày chứng từ (invoiceDate) theo quy tắc công nợ của khách
 * hàng — trả về null nếu thiếu invoiceDate hoặc khách chưa có quy tắc (giữ nguyên hành vi cũ:
 * hạn thanh toán nhập tay). */
export function computeDueDateFromTerm(invoiceDate: Date | null, term: PaymentTerm): Date | null {
  if (!invoiceDate || !term.paymentTermType) return null;
  if (term.paymentTermType === "DAYS_FROM_INVOICE") {
    if (term.paymentTermDays == null) return null;
    const d = new Date(invoiceDate);
    d.setDate(d.getDate() + term.paymentTermDays);
    return d;
  }
  if (term.paymentTermType === "END_OF_MONTH_OFFSET") {
    if (term.paymentTermMonthOffset == null) return null;
    // new Date(year, month0 + offset + 1, 0) = ngày 0 của tháng SAU tháng đích = ngày cuối cùng
    // của tháng đích (tháng hoá đơn + offset).
    return new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + term.paymentTermMonthOffset + 1, 0);
  }
  return null;
}

/** Mô tả ngắn quy tắc để hiển thị — vd "30 ngày kể từ ngày chứng từ", "Cuối tháng N+2". */
export function describePaymentTerm(term: PaymentTerm): string {
  if (term.paymentTermType === "DAYS_FROM_INVOICE" && term.paymentTermDays != null) {
    return `${term.paymentTermDays} ngày kể từ ngày chứng từ`;
  }
  if (term.paymentTermType === "END_OF_MONTH_OFFSET" && term.paymentTermMonthOffset != null) {
    return `Cuối tháng N+${term.paymentTermMonthOffset}`;
  }
  return "Chưa thiết lập";
}
