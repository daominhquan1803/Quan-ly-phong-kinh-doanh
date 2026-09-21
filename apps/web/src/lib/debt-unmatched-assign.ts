/**
 * Gắn tiền về CHƯA KHỚP (DebtPayment UNMATCHED/PARTIAL) vào 1 hoá đơn công nợ đang có — tính số tiền được
 * gắn và trạng thái mới của khoản tiền về. Quản trị viên chọn hoá đơn; số tiền mặc định = min(tiền chưa
 * khớp, số còn phải thu của hoá đơn), không được vượt cả hai (sai số 0,5đ do làm tròn).
 */
export type AssignPlan = { ok: true; amount: number; newStatus: "MATCHED" | "PARTIAL" } | { ok: false; error: string };

const EPS = 0.5;

export function planAssign(unallocated: number, invoiceRemaining: number, requested?: number | null): AssignPlan {
  if (unallocated <= EPS) return { ok: false, error: "Khoản tiền về này đã khớp hết, không còn gì để gắn" };
  if (invoiceRemaining <= EPS) return { ok: false, error: "Hoá đơn này đã thu đủ, không còn số phải thu" };
  const amount = requested == null ? Math.min(unallocated, invoiceRemaining) : requested;
  if (!(amount > 0)) return { ok: false, error: "Số tiền gắn phải lớn hơn 0" };
  if (amount > unallocated + EPS) {
    return { ok: false, error: `Số tiền vượt quá số chưa khớp (${Math.round(unallocated).toLocaleString("vi-VN")}đ)` };
  }
  if (amount > invoiceRemaining + EPS) {
    return { ok: false, error: `Số tiền vượt quá số còn phải thu của hoá đơn (${Math.round(invoiceRemaining).toLocaleString("vi-VN")}đ)` };
  }
  return { ok: true, amount, newStatus: unallocated - amount <= EPS ? "MATCHED" : "PARTIAL" };
}
