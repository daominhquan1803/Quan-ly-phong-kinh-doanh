import { prisma, Prisma } from "@hoanggia/db";
import { mondayOfWeek } from "@/lib/debt-status";

const DAY_MS = 24 * 60 * 60 * 1000;
const EPS = 0.5;

export interface FollowUpInput {
  id: string;
  invoiceNumber: string | null;
  customerCode: string;
  customerName: string;
  invoiceDate: Date | null;
  originalAmount: number;
  paidAmount: number;
  expectedPaymentDate: Date | null;
  salesEmployeeId: string | null;
  employeeName: string;
  allocations: { amount: number; paymentDate: Date | null }[];
}

export interface FollowUpInvoice {
  id: string;
  invoiceNumber: string | null;
  customerCode: string;
  customerName: string;
  employeeName: string;
  expectedPaymentDate: Date;
  kind: "planned" | "slipped";
  /** Số tuần trượt (kind = slipped, ≥ 1); 0 với khoản đúng kế hoạch tuần. */
  slippedWeeks: number;
  /** Còn nợ tại đầu tuần (trước 00:00 Thứ 2). */
  openAtStart: number;
  collected: number;
  remaining: number;
}

export interface FollowUpRow {
  employeeId: string;
  employeeName: string;
  plannedAmount: number;
  plannedCount: number;
  slippedAmount: number;
  slippedCount: number;
  total: number;
  collected: number;
  remaining: number;
}

export interface FollowUpResult {
  weekStart: Date;
  /** Chủ nhật cuối tuần (bao gồm). */
  weekEnd: Date;
  isCurrentWeek: boolean;
  rows: FollowUpRow[];
  totals: Omit<FollowUpRow, "employeeId" | "employeeName">;
  invoices: FollowUpInvoice[];
}

/**
 * "Cần thu tuần này" — đẩy khoản trượt kế hoạch sang đầu tuần để nhắc nhân viên thu tiếp. KHÔNG sửa
 * ngày dự kiến trong dữ liệu (bảng Kế hoạch thu tháng vẫn đánh giá đúng kế hoạch ban đầu); chỉ tính
 * khi hiển thị. Với tuần [thứ 2, chủ nhật], mỗi hoá đơn còn nợ tại đầu tuần mà ngày dự kiến ≤ chủ nhật:
 * ngày dự kiến trong tuần = "Kế hoạch tuần", trước thứ 2 = "Trượt từ trước" (gộp mọi tuần trượt).
 * Số tiền = phần CÒN NỢ tại đầu tuần (đã trừ tiền về trước thứ 2); "đã thu" = tiền về thật trong tuần.
 * Nhân viên đổi ngày dự kiến sang tuần sau thì hoá đơn không còn là "trượt" (đúng kế hoạch mới).
 */
export function computeFollowUp(inputs: FollowUpInput[], anyDateInWeek: Date, now: Date = new Date()): FollowUpResult {
  const weekStart = mondayOfWeek(anyDateInWeek);
  const weekEndExcl = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6);
  const isCurrentWeek = mondayOfWeek(now).getTime() === weekStart.getTime();

  const invoices: FollowUpInvoice[] = [];
  const byEmp = new Map<string, FollowUpRow>();

  for (const inv of inputs) {
    const expected = inv.expectedPaymentDate;
    if (!expected || expected >= weekEndExcl) continue;
    if (inv.invoiceDate && inv.invoiceDate >= weekEndExcl) continue;

    // Phần nhập thẳng từ file Công nợ gốc (paidAmount không có allocation) coi như thu từ trước mọi mốc;
    // allocation không có ngày cũng coi như đã thu trước (không biết ngày thì không tính vào tuần).
    const allocTotal = inv.allocations.reduce((s, a) => s + a.amount, 0);
    const untracked = Math.max(0, inv.paidAmount - allocTotal);
    const paidBefore =
      untracked + inv.allocations.reduce((s, a) => (!a.paymentDate || a.paymentDate < weekStart ? s + a.amount : s), 0);
    const openAtStart = Math.max(0, inv.originalAmount - paidBefore);
    if (openAtStart <= EPS) continue;

    const collected = Math.min(
      openAtStart,
      inv.allocations.reduce(
        (s, a) => (a.paymentDate && a.paymentDate >= weekStart && a.paymentDate < weekEndExcl ? s + a.amount : s),
        0
      )
    );
    const kind = expected >= weekStart ? "planned" : "slipped";
    const slippedWeeks =
      kind === "slipped" ? Math.max(1, Math.round((weekStart.getTime() - mondayOfWeek(expected).getTime()) / (7 * DAY_MS))) : 0;
    const remaining = openAtStart - collected;

    invoices.push({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerCode: inv.customerCode,
      customerName: inv.customerName,
      employeeName: inv.employeeName,
      expectedPaymentDate: expected,
      kind,
      slippedWeeks,
      openAtStart,
      collected,
      remaining,
    });

    const key = inv.salesEmployeeId ?? "";
    const row =
      byEmp.get(key) ??
      ({
        employeeId: key,
        employeeName: inv.salesEmployeeId ? inv.employeeName : "(Chưa gán)",
        plannedAmount: 0,
        plannedCount: 0,
        slippedAmount: 0,
        slippedCount: 0,
        total: 0,
        collected: 0,
        remaining: 0,
      } satisfies FollowUpRow);
    if (kind === "planned") {
      row.plannedAmount += openAtStart;
      row.plannedCount++;
    } else {
      row.slippedAmount += openAtStart;
      row.slippedCount++;
    }
    row.total += openAtStart;
    row.collected += collected;
    row.remaining += remaining;
    byEmp.set(key, row);
  }

  const rows = Array.from(byEmp.values()).sort((a, b) => b.remaining - a.remaining);
  const totals = rows.reduce(
    (t, r) => ({
      plannedAmount: t.plannedAmount + r.plannedAmount,
      plannedCount: t.plannedCount + r.plannedCount,
      slippedAmount: t.slippedAmount + r.slippedAmount,
      slippedCount: t.slippedCount + r.slippedCount,
      total: t.total + r.total,
      collected: t.collected + r.collected,
      remaining: t.remaining + r.remaining,
    }),
    { plannedAmount: 0, plannedCount: 0, slippedAmount: 0, slippedCount: 0, total: 0, collected: 0, remaining: 0 }
  );
  // Trượt lâu nhất lên đầu, rồi tới số tiền còn phải thu lớn nhất.
  invoices.sort((a, b) => b.slippedWeeks - a.slippedWeeks || b.remaining - a.remaining);
  return { weekStart, weekEnd, isCurrentWeek, rows, totals, invoices };
}

/** Lấy hoá đơn trong phạm vi `where` rồi tính "Cần thu tuần này" cho tuần chứa `anyDateInWeek`. */
export async function getFollowUp(where: Prisma.DebtInvoiceWhereInput, anyDateInWeek: Date, now: Date = new Date()) {
  const weekStart = mondayOfWeek(anyDateInWeek);
  const weekEndExcl = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);
  const invoices = await prisma.debtInvoice.findMany({
    where: { ...where, expectedPaymentDate: { not: null, lt: weekEndExcl } },
    select: {
      id: true,
      invoiceNumber: true,
      customerCode: true,
      customerName: true,
      invoiceDate: true,
      originalAmount: true,
      paidAmount: true,
      expectedPaymentDate: true,
      salesEmployeeId: true,
      salesEmployee: { select: { name: true } },
      allocations: { select: { amount: true, payment: { select: { paymentDate: true } } } },
    },
  });
  return computeFollowUp(
    invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      customerCode: i.customerCode,
      customerName: i.customerName,
      invoiceDate: i.invoiceDate,
      originalAmount: Number(i.originalAmount),
      paidAmount: Number(i.paidAmount),
      expectedPaymentDate: i.expectedPaymentDate,
      salesEmployeeId: i.salesEmployeeId,
      employeeName: i.salesEmployee?.name ?? "(Chưa gán)",
      allocations: i.allocations.map((a) => ({ amount: Number(a.amount), paymentDate: a.payment.paymentDate })),
    })),
    anyDateInWeek,
    now
  );
}
