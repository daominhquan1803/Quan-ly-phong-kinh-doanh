export type MatchMethod = "INVOICE_NUMBER" | "EXACT_AMOUNT" | "FIFO";
export type MatchStatus = "MATCHED" | "PARTIAL" | "UNMATCHED";

export interface AllocationCandidateInvoice {
  id: string;
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  remaining: number; // originalAmount - paidAmount tại thời điểm tính (đã trừ các allocation trước đó nếu có)
  /** Số hoá đơn CŨ mà hoá đơn này đã thay thế/điều chỉnh — khách còn ghi số cũ trong nội dung thì vẫn khớp vào đây. */
  supersedes?: string[];
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
  /** Số hoá đơn nội dung nhắc tới nhưng KHÔNG gán được (không có trong hệ thống, hoặc đã thu đủ). Khác rỗng thì
   * phần tiền còn lại KHÔNG bị trừ dần vào hoá đơn khác — để admin kiểm tra/gán tay. */
  unresolvedNumbers: string[];
}

const AMOUNT_EPSILON = 1; // sai số làm tròn tối đa 1đ khi so khớp "đúng số tiền"

function byInvoiceDateAsc(a: AllocationCandidateInvoice, b: AllocationCandidateInvoice): number {
  const ta = a.invoiceDate ? a.invoiceDate.getTime() : Infinity;
  const tb = b.invoiceDate ? b.invoiceDate.getTime() : Infinity;
  if (ta !== tb) return ta - tb;
  return a.id.localeCompare(b.id);
}

/**
 * Khoá so sánh số hoá đơn: số thuần chữ số bỏ số 0 đứng đầu ("00002021" = "0002021" = "2021") — khách hay ghi 4 số cuối,
 * và hoá đơn cũ trong app có khi chỉ 7 chữ số; số có chữ (vd "BH0126.7053") so khớp nguyên văn không phân biệt hoa/thường.
 */
export function invoiceKey(n: string): string {
  const s = n.trim();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s.toUpperCase();
}

const numbersOf = (i: AllocationCandidateInvoice): string[] => [i.invoiceNumber, ...(i.supersedes ?? [])].filter((n): n is string => !!n);

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
 * Hàm thuần (không đụng DB) — bên gọi (route preview/commit) tự truy vấn danh sách hoá đơn của
 * khách (KỂ CẢ hoá đơn đã thu đủ, để biết số hoá đơn nội dung nhắc tới có tồn tại hay không) rồi
 * truyền vào, để dùng chung được cho cả bước xem trước lẫn bước ghi thật.
 *
 * Quy tắc an toàn (anh Quân, 16/10/2026): nội dung đã GHI số hoá đơn mà số đó không gán được (không có
 * trong hệ thống — vd hoá đơn thay thế chưa nhập —, hoặc đã thu đủ) thì phần tiền còn lại KHÔNG được
 * trừ nhầm vào hoá đơn khác (đúng số tiền / FIFO); để chưa khớp và báo `unresolvedNumbers`.
 */
export function planPaymentAllocation(
  payment: { amount: number; candidateInvoiceNumbers: string[] },
  invoices: AllocationCandidateInvoice[]
): AllocationPlan {
  const cited = payment.candidateInvoiceNumbers;
  const unpaid = invoices.filter((i) => i.remaining > 0).sort(byInvoiceDateAsc);
  if (unpaid.length === 0) {
    return { allocations: [], matchStatus: "UNMATCHED", unallocatedAmount: payment.amount, unresolvedNumbers: cited };
  }

  let allocations: AllocationPlanItem[] = [];
  let remaining = payment.amount;
  let usedIds = new Set<string>();
  const matchedNumbers = new Set<string>();

  // 1) Khớp theo số hoá đơn nhắc trong mô tả — trừ vào các hoá đơn khớp trước (sắp cũ->mới nếu
  // khớp nhiều hoá đơn cùng lúc), tiền dư ra (nếu có) chảy tiếp sang FIFO ở bước dưới.
  if (cited.length > 0) {
    const citedKeys = new Set(cited.map(invoiceKey));
    const matched = unpaid.filter((i) => numbersOf(i).some((n) => citedKeys.has(invoiceKey(n))));
    if (matched.length > 0) {
      for (const i of matched) for (const n of numbersOf(i)) if (citedKeys.has(invoiceKey(n))) matchedNumbers.add(invoiceKey(n));
      const step = consumeFifo(remaining, matched, "INVOICE_NUMBER");
      allocations = allocations.concat(step.allocations);
      remaining = step.remaining;
      usedIds = new Set(step.allocations.map((a) => a.invoiceId));
    }
  }
  const unresolvedNumbers = cited.filter((n) => !matchedNumbers.has(invoiceKey(n)));
  // Có số hoá đơn không gán được -> dừng ở đây, không đoán.
  const guessAllowed = unresolvedNumbers.length === 0;

  // 2) Nếu chưa khớp được gì qua số hoá đơn, thử khớp đúng số tiền còn lại của ĐÚNG 1 hoá đơn —
  // nhiều hoá đơn cùng trùng số tiền thì bỏ qua nhánh này (không đủ căn cứ chọn đúng), rơi xuống FIFO.
  if (guessAllowed && allocations.length === 0 && remaining > 0) {
    const exactCandidates = unpaid.filter((i) => Math.abs(i.remaining - remaining) <= AMOUNT_EPSILON);
    if (exactCandidates.length === 1) {
      allocations.push({ invoiceId: exactCandidates[0].id, amount: remaining, matchMethod: "EXACT_AMOUNT" });
      usedIds.add(exactCandidates[0].id);
      remaining = 0;
    }
  }

  // 3) Còn dư (chưa khớp gì, hoặc khớp 1+2 chưa hết tiền) -> trừ dần từ hoá đơn xa nhất chưa dùng.
  if (guessAllowed && remaining > 0) {
    const fifoTargets = unpaid.filter((i) => !usedIds.has(i.id));
    const step = consumeFifo(remaining, fifoTargets, "FIFO");
    allocations = allocations.concat(step.allocations);
    remaining = step.remaining;
  }

  const matchStatus: MatchStatus = remaining <= 0 ? "MATCHED" : allocations.length > 0 ? "PARTIAL" : "UNMATCHED";
  return { allocations, matchStatus, unallocatedAmount: Math.max(0, remaining), unresolvedNumbers };
}
