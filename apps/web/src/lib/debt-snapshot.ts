import { prisma, Prisma } from "@hoanggia/db";
import { remainingAmount, computeDebtStatus, overdueDays, type DebtStatus } from "@/lib/debt-status";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DebtEmployeeTotals {
  employeeId: string;
  employeeName: string;
  invoiceCount: number; // số hoá đơn còn nợ
  totalDebt: number;
  overdueDebt: number;
  badDebt: number;
  noDueDebt: number;
  noScheduleCount: number; // còn nợ nhưng NVKD chưa điền ngày dự kiến thanh toán
  noScheduleAmount: number;
}

export interface DebtOverdueInvoice {
  invoiceNumber: string | null;
  customerCode: string;
  customerName: string;
  employeeName: string;
  dueDate: Date | null;
  daysOverdue: number;
  remaining: number;
  status: DebtStatus;
}

export interface DebtSnapshot {
  totalOriginal: number;
  totalPaid: number;
  totalDebt: number;
  overdueDebt: number;
  badDebt: number;
  noDueDebt: number; // còn nợ nhưng chưa có hạn thanh toán — không xếp quá hạn được
  noScheduleCount: number;
  noScheduleAmount: number;
  openInvoiceCount: number;
  perEmployee: Map<string, DebtEmployeeTotals>;
  overdueInvoices: DebtOverdueInvoice[];
}

/**
 * Công nợ tại 1 thời điểm — dùng chung cho /api/debt/summary và báo cáo tuần/tháng để 2 nơi luôn
 * cùng 1 cách tính. `asOfDate` = xem công nợ CHỐT CUỐI NGÀY đó (null = hiện tại): chỉ tính hoá
 * đơn có chứng từ tới ngày này; "đã thu" = phần nhập thẳng từ file Công nợ gốc (paidAmount trừ
 * tổng allocation, coi như thu từ trước mọi mốc) + tiền về THẬT có ngày <= asOfDate; quá hạn so
 * với 00:00 ngày kế tiếp (hoá đơn hạn đúng ngày chọn mà chưa thu tính quá hạn 1 ngày — anh Quân
 * xác nhận 05/10/2026).
 */
export async function getDebtSnapshot(opts: {
  where: Prisma.DebtInvoiceWhereInput;
  asOfDate: Date | null;
  withOverdueInvoices?: boolean;
}): Promise<DebtSnapshot> {
  const { where, asOfDate } = opts;
  const overdueRefDate = asOfDate ? new Date(asOfDate.getTime() + DAY_MS) : undefined;

  const invoices = await prisma.debtInvoice.findMany({
    where,
    select: {
      id: true,
      invoiceNumber: true,
      customerCode: true,
      customerName: true,
      invoiceDate: true,
      originalAmount: true,
      paidAmount: true,
      dueDate: true,
      expectedPaymentDate: true,
      salesEmployeeId: true,
      salesEmployee: { select: { name: true } },
    },
  });

  let paidAsOfByInvoice: Map<string, number> | null = null;
  if (asOfDate) {
    const allocs = await prisma.debtPaymentAllocation.findMany({
      where: { invoiceId: { in: invoices.map((i) => i.id) } },
      select: { invoiceId: true, amount: true, payment: { select: { paymentDate: true } } },
    });
    const allAlloc = new Map<string, number>();
    const allocAsOf = new Map<string, number>();
    for (const a of allocs) {
      const amt = Number(a.amount);
      allAlloc.set(a.invoiceId, (allAlloc.get(a.invoiceId) ?? 0) + amt);
      const d = a.payment.paymentDate;
      if (d && d <= asOfDate) allocAsOf.set(a.invoiceId, (allocAsOf.get(a.invoiceId) ?? 0) + amt);
    }
    paidAsOfByInvoice = new Map();
    for (const inv of invoices) {
      const untracked = Math.max(0, Number(inv.paidAmount) - (allAlloc.get(inv.id) ?? 0));
      paidAsOfByInvoice.set(inv.id, untracked + (allocAsOf.get(inv.id) ?? 0));
    }
  }

  const snap: DebtSnapshot = {
    totalOriginal: 0,
    totalPaid: 0,
    totalDebt: 0,
    overdueDebt: 0,
    badDebt: 0,
    noDueDebt: 0,
    noScheduleCount: 0,
    noScheduleAmount: 0,
    openInvoiceCount: 0,
    perEmployee: new Map(),
    overdueInvoices: [],
  };

  for (const inv of invoices) {
    // Hoá đơn chưa phát sinh tại asOfDate bị bỏ; không rõ ngày chứng từ thì vẫn tính.
    if (asOfDate && inv.invoiceDate && inv.invoiceDate > asOfDate) continue;

    const original = Number(inv.originalAmount);
    const paid = asOfDate ? paidAsOfByInvoice!.get(inv.id) ?? 0 : Number(inv.paidAmount);
    const remaining = remainingAmount(original, paid);
    const status = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid }, overdueRefDate);
    const isOverdue = status === "OVERDUE" || status === "BAD_DEBT";
    const noSchedule = status !== "PAID" && !inv.expectedPaymentDate;

    snap.totalOriginal += original;
    snap.totalPaid += paid;
    snap.totalDebt += remaining;
    if (isOverdue) snap.overdueDebt += remaining;
    if (status === "BAD_DEBT") snap.badDebt += remaining;
    if (status === "NO_DUE_DATE") snap.noDueDebt += remaining;
    if (remaining > 0) snap.openInvoiceCount++;
    if (noSchedule && remaining > 0) {
      snap.noScheduleCount++;
      snap.noScheduleAmount += remaining;
    }

    if (inv.salesEmployeeId) {
      const e = snap.perEmployee.get(inv.salesEmployeeId) ?? {
        employeeId: inv.salesEmployeeId,
        employeeName: inv.salesEmployee?.name ?? "—",
        invoiceCount: 0,
        totalDebt: 0,
        overdueDebt: 0,
        badDebt: 0,
        noDueDebt: 0,
        noScheduleCount: 0,
        noScheduleAmount: 0,
      };
      e.totalDebt += remaining;
      if (remaining > 0) e.invoiceCount++;
      if (isOverdue) e.overdueDebt += remaining;
      if (status === "BAD_DEBT") e.badDebt += remaining;
      if (status === "NO_DUE_DATE") e.noDueDebt += remaining;
      if (noSchedule && remaining > 0) {
        e.noScheduleCount++;
        e.noScheduleAmount += remaining;
      }
      snap.perEmployee.set(inv.salesEmployeeId, e);
    }

    if (opts.withOverdueInvoices && isOverdue && remaining > 0) {
      snap.overdueInvoices.push({
        invoiceNumber: inv.invoiceNumber,
        customerCode: inv.customerCode,
        customerName: inv.customerName,
        employeeName: inv.salesEmployee?.name ?? "(Chưa gán)",
        dueDate: inv.dueDate,
        daysOverdue: overdueDays(inv.dueDate, overdueRefDate) ?? 0,
        remaining,
        status,
      });
    }
  }

  snap.overdueInvoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
  return snap;
}

export interface CollectionBucket {
  start: Date;
  /** Loại trừ. */
  end: Date;
}

export interface CollectionPlanRow {
  planned: number[]; // theo từng bucket
  collected: number[];
}

/**
 * Kế hoạch thu vs đã thu theo từng nhân viên cho các bucket ngày (tuần/kỳ). Kế hoạch = TOÀN BỘ
 * `originalAmount` hoá đơn có `expectedPaymentDate` rơi vào bucket; đã thu = allocation có NGÀY
 * TIỀN VỀ THẬT trong bucket (không theo tuần dự kiến — xem giải thích ở /api/debt/summary). Khoá
 * "" = hoá đơn chưa gán NVKD.
 */
export async function getCollectionPlan(
  where: Prisma.DebtInvoiceWhereInput,
  buckets: CollectionBucket[]
): Promise<Map<string, CollectionPlanRow>> {
  const result = new Map<string, CollectionPlanRow>();
  const rowFor = (key: string) => {
    let r = result.get(key);
    if (!r) {
      r = { planned: buckets.map(() => 0), collected: buckets.map(() => 0) };
      result.set(key, r);
    }
    return r;
  };
  const idx = (d: Date | null) => (d ? buckets.findIndex((b) => d >= b.start && d < b.end) : -1);

  const invoices = await prisma.debtInvoice.findMany({
    where,
    select: { originalAmount: true, expectedPaymentDate: true, salesEmployeeId: true },
  });
  for (const inv of invoices) {
    const i = idx(inv.expectedPaymentDate);
    if (i >= 0) rowFor(inv.salesEmployeeId ?? "").planned[i] += Number(inv.originalAmount);
  }

  const allocations = await prisma.debtPaymentAllocation.findMany({
    where: { invoice: where },
    select: { amount: true, invoice: { select: { salesEmployeeId: true } }, payment: { select: { paymentDate: true } } },
  });
  for (const a of allocations) {
    const i = idx(a.payment.paymentDate);
    if (i >= 0) rowFor(a.invoice.salesEmployeeId ?? "").collected[i] += Number(a.amount);
  }
  return result;
}
