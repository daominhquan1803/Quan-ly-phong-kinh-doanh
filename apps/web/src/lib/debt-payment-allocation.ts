export type MatchMethod = "INVOICE_NUMBER" | "EXACT_AMOUNT" | "FIFO";
export type MatchStatus = "MATCHED" | "PARTIAL" | "UNMATCHED";

export interface AllocationCandidateInvoice {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  remaining: number; // originalAmount - paidAmount tại thời điểm tính (đã trừ các allocation trước đó nếu có)
}

export interface AllocationPlanItem {
  invoiceId: string;
  amount: number;
  matchMethod: MatchMethod;
}

export interface AllocationPlan {
  allocations: AllocationPlanItem[];
  matchStatus: MatchStatus;
  unallocatedAmount: number;
}

const AMOUNT_EPSILON = 1; // sai số làm tròn tối đa 1đ khi so khớp "đúng số tiền"

function byInvoiceDateAsc(a: AllocationCandidateInvoice, b: AllocationCandidateInvoice): number {
  const ta = a.invoiceDate ? a.invoiceDate.getTime() : Infinity;
  const tb = b.invoiceDate ? b.invoiceDate.getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/** Trừ dần `amount` lần lượt vào các hoá đơn trong `targets` (đã sắp xếp sẵn) theo remaining còn
 * lại của từng hoá đơn — dùng chung cho cả nhánh khớp số hoá đơn (trừ vào các hoá đơn khớp trước)
 * lẫn nhánh FIFO thuần (trừ dần từ hoá đơn xa nhất). */
function consumeFifo(
  amount: number,
  targets: AllocationCandidateInvoice[],
  matchMethod: MatchMethod
): { allocations: AllocationPlanItem[]; remaining: number } {
  const allocations: AllocationPlanItem[] = [];
  let remaining = amount;
  for (const inv of targets) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, inv.remaining);
    if (take <= 0) continue;
    allocations.push({ invoiceId: inv.id, amount: take, matchMethod });
    remaining -= take;
  }
  return { allocations, remaining };
}

/**
 * Lập kế hoạch khớp 1 khoản "Tiền về" vào (các) hoá đơn công nợ của cùng 1 khách hàng — theo
 * đúng thứ tự ưu tiên anh Quân yêu cầu: khớp số hoá đơn nhắc trong mô tả giao dịch > khớp đúng số
 * tiền còn lại của 1 hoá đơn > không rõ thì trừ dần từ hoá đơn xa nhất (invoiceDate cũ nhất).
 * Hàm thuần (không đụng DB) — bên gọi (route preview/commit) tự truy vấn danh sách hoá đơn còn nợ
 * của khách hàng rồi truyền vào, để dùng chung được cho cả bước xem trước lẫn bước ghi thật.
 */
export function planPaymentAllocation(
  payment: { amount: number; candidateInvoiceNumbers: string[] },
  invoices: AllocationCandidateInvoice[]
): AllocationPlan {
  const unpaid = invoices.filter((i) => i.remaining > 0).sort(byInvoiceDateAsc);
  if (unpaid.length === 0) {
    return { allocations: [], matchStatus: "UNMATCHED", unallocatedAmount: payment.amount };
  }

  let allocations: AllocationPlanItem[] = [];
  let remaining = payment.amount;
  let usedIds = new Set<string>();

  // 1) Khớp theo số hoá đơn nhắc trong mô tả — trừ vào các hoá đơn khớp trước (sắp cũ->mới nếu
  // khớp nhiều hoá đơn cùng lúc), tiền dư ra (nếu có) chảy tiếp sang FIFO ở bước dưới.
  if (payment.candidateInvoiceNumbers.length > 0) {
    const matched = unpaid.filter((i) => i.invoiceNumber && payment.candidateInvoiceNumbers.includes(i.invoiceNumber));
    if (matched.length > 0) {
      const step = consumeFifo(remaining, matched, "INVOICE_NUMBER");
      allocations = allocations.concat(step.allocations);
      remaining = step.remaining;
      usedIds = new Set(step.allocations.map((a) => a.invoiceId));
    }
  }

  // 2) Nếu chưa khớp được gì qua số hoá đơn, thử khớp đúng số tiền còn lại của ĐÚNG 1 hoá đơn —
  // nhiều hoá đơn cùng trùng số tiền thì bỏ qua nhánh này (không đủ căn cứ chọn đúng), rơi xuống FIFO.
  if (allocations.length === 0 && remaining > 0) {
    const exactCandidates = unpaid.filter((i) => Math.abs(i.remaining - remaining) <= AMOUNT_EPSILON);
    if (exactCandidates.length === 1) {
      allocations.push({ invoiceId: exactCandidates[0].id, amount: remaining, matchMethod: "EXACT_AMOUNT" });
      usedIds.add(exactCandidates[0].id);
      remaining = 0;
    }
  }

  // 3) Còn dư (chưa khớp gì, hoặc khớp 1+2 chưa hết tiền) -> trừ dần từ hoá đơn xa nhất chưa dùng.
  if (remaining > 0) {
    const fifoTargets = unpaid.filter((i) => !usedIds.has(i.id));
    const step = consumeFifo(remaining, fifoTargets, "FIFO");
    allocations = allocations.concat(step.allocations);
    remaining = step.remaining;
  }

  const matchStatus: MatchStatus = remaining <= 0 ? "MATCHED" : allocations.length > 0 ? "PARTIAL" : "UNMATCHED";
  return { allocations, matchStatus, unallocatedAmount: Math.max(0, remaining) };
}
