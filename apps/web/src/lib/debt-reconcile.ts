// Chỉnh công nợ khi hoá đơn bị thay thế/điều chỉnh, và khớp lại Tiền về sau khi hoá đơn đổi.
// Dùng chung cho route nhập hoá đơn (api/debt/import/new-invoices) và script sửa dữ liệu. Chỉ import @hoanggia/db
// + file thuần bằng đường dẫn tương đối để chạy được bằng tsx trong container worker.
import { prisma, Prisma } from "@hoanggia/db";
import { planPaymentAllocation, invoiceKey } from "./debt-payment-allocation";
import { extractInvoiceNumbersFromDescription } from "./debt-payments-parser";
import { isFuzzyDuplicate, paymentDescKey } from "./debt-payment-dedupe";

type Db = typeof prisma;
const EPS = 0.5;

export interface RemovalOutcome {
  customerCode: string;
  invoiceNumber: string;
  result: "REMOVED" | "MOVED" | "KEPT_PAID" | "NOT_FOUND";
  /** Số tiền còn phải thu của hoá đơn bị xoá (để báo tác động lên tổng công nợ). */
  remaining: number;
  releasedPaymentIds: string[];
}

/**
 * Xoá 1 hoá đơn đã bị thay thế/điều chỉnh khỏi công nợ.
 *  - Có hoá đơn thay thế (replacedBy) đã nhập: chuyển các khoản đã thu sang hoá đơn thay thế (tối đa bằng số còn
 *    phải thu của nó), ghi lại số cũ vào `supersedes` để khách còn ghi số cũ vẫn khớp.
 *  - Không có hoá đơn thay thế: đã thu ĐỦ thì GIỮ LẠI (xoá sẽ làm mất dấu khoản khách đã trả); chưa thu đủ thì xoá và
 *    nhả các khoản đã gán (các Tiền về đó cần khớp lại, xem rematchPayment).
 */
export async function removeInvoice(
  db: Db,
  r: { customerCode: string; invoiceNumber: string; replacedBy?: string | null }
): Promise<RemovalOutcome> {
  const base = { customerCode: r.customerCode, invoiceNumber: r.invoiceNumber };
  const inv = await db.debtInvoice.findUnique({
    where: { customerCode_invoiceNumber: { customerCode: r.customerCode, invoiceNumber: r.invoiceNumber } },
    include: { allocations: true },
  });
  if (!inv) return { ...base, result: "NOT_FOUND", remaining: 0, releasedPaymentIds: [] };

  const remaining = Math.max(0, Number(inv.originalAmount) - Number(inv.paidAmount));
  const target = r.replacedBy
    ? await db.debtInvoice.findUnique({
        where: { customerCode_invoiceNumber: { customerCode: r.customerCode, invoiceNumber: r.replacedBy } },
      })
    : null;

  // Đã thu đủ và có khoản tiền về gán vào: chỉ xoá khi hoá đơn thay thế đủ chỗ nhận lại TOÀN BỘ số đã thu; ngược lại giữ
  // lại để không làm mất dấu khoản khách đã trả.
  const paidTotal = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
  const targetRoom = target ? Math.max(0, Number(target.originalAmount) - Number(target.paidAmount)) : 0;
  if (inv.allocations.length > 0 && remaining <= EPS && targetRoom + EPS < paidTotal) {
    // Ghi số hoá đơn thay thế (chưa nhập được) làm tên gọi khác của hoá đơn này, để tiền về ghi số mới vẫn nhận ra khoản đã thu.
    if (r.replacedBy && !(inv.supersedes ?? []).includes(r.replacedBy)) {
      await db.debtInvoice.update({ where: { id: inv.id }, data: { supersedes: { push: r.replacedBy } } });
    }
    return { ...base, result: "KEPT_PAID", remaining, releasedPaymentIds: [] };
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  const released = new Set<string>();
  let moved = false;

  if (target) {
    let room = Math.max(0, Number(target.originalAmount) - Number(target.paidAmount));
    for (const a of inv.allocations) {
      const amt = Number(a.amount);
      const move = Math.min(amt, room);
      if (move > EPS) {
        ops.push(db.debtPaymentAllocation.update({ where: { id: a.id }, data: { invoiceId: target.id, amount: move, matchMethod: "INVOICE_NUMBER" } }));
        ops.push(db.debtInvoice.update({ where: { id: target.id }, data: { paidAmount: { increment: move } } }));
        room -= move;
        moved = true;
        if (amt - move > EPS) released.add(a.paymentId);
      } else {
        ops.push(db.debtPaymentAllocation.delete({ where: { id: a.id } }));
        released.add(a.paymentId);
      }
    }
    ops.push(db.debtInvoice.update({ where: { id: target.id }, data: { supersedes: { push: r.invoiceNumber } } }));
  } else {
    for (const a of inv.allocations) {
      ops.push(db.debtPaymentAllocation.delete({ where: { id: a.id } }));
      released.add(a.paymentId);
    }
  }
  ops.push(db.debtInvoice.delete({ where: { id: inv.id } }));
  await db.$transaction(ops);
  return { ...base, result: moved ? "MOVED" : "REMOVED", remaining, releasedPaymentIds: Array.from(released) };
}

/** Khớp lại phần CHƯA gán của 1 khoản Tiền về theo luật hiện hành (số hoá đơn > số tiền > FIFO; số HĐ nhắc mà không gán được thì không đoán). */
export async function rematchPayment(db: Db, paymentId: string): Promise<{ before: string; after: string; added: number } | null> {
  const p = await db.debtPayment.findUnique({ where: { id: paymentId }, include: { allocations: true } });
  if (!p || p.matchStatus === "IGNORED") return null;

  let allocated = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
  let unallocated = Number(p.amount) - allocated;
  let added = 0;

  if (unallocated > EPS && p.customerCode) {
    const invoices = await db.debtInvoice.findMany({ where: { customerCode: p.customerCode } });
    const plan = planPaymentAllocation(
      { amount: unallocated, candidateInvoiceNumbers: extractInvoiceNumbersFromDescription(p.rawDescription) },
      invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        invoiceDate: i.invoiceDate,
        remaining: Math.max(0, Number(i.originalAmount) - Number(i.paidAmount)),
        supersedes: i.supersedes,
      }))
    );
    const ops = plan.allocations.flatMap((a) => [
      db.debtPaymentAllocation.create({ data: { paymentId: p.id, invoiceId: a.invoiceId, amount: a.amount, matchMethod: a.matchMethod } }),
      db.debtInvoice.update({ where: { id: a.invoiceId }, data: { paidAmount: { increment: a.amount } } }),
    ]);
    if (ops.length > 0) await db.$transaction(ops);
    added = plan.allocations.reduce((s, a) => s + a.amount, 0);
    allocated += added;
    unallocated = Number(p.amount) - allocated;
  }

  const status = unallocated <= EPS ? "MATCHED" : allocated > EPS ? "PARTIAL" : "UNMATCHED";
  if (status !== p.matchStatus) await db.debtPayment.update({ where: { id: p.id }, data: { matchStatus: status } });
  return { before: p.matchStatus, after: status, added };
}

/**
 * Nhả các khoản FIFO (do app tự ĐOÁN) của một Tiền về mà nội dung ghi số hoá đơn không gán được: tiền đó trả
 * cho hoá đơn khác chứ không phải hoá đơn bị đoán. Khoản gán vào đúng hoá đơn nội dung nhắc tới (kể cả theo tên gọi khác)
 * và khoản gán tay giữ nguyên. Trả về số tiền nhả.
 */
export async function releaseGuessedAllocations(db: Db, paymentId: string): Promise<number> {
  const p = await db.debtPayment.findUnique({
    where: { id: paymentId },
    include: { allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, supersedes: true } } } } },
  });
  if (!p || !p.customerCode || p.matchStatus === "IGNORED") return 0;
  const cited = extractInvoiceNumbersFromDescription(p.rawDescription);
  if (cited.length === 0) return 0;
  const invoices = await db.debtInvoice.findMany({ where: { customerCode: p.customerCode }, select: { invoiceNumber: true, supersedes: true } });
  const known = new Set(invoices.flatMap((i) => [i.invoiceNumber, ...(i.supersedes ?? [])]).filter((n): n is string => !!n).map(invoiceKey));
  if (cited.every((n) => known.has(invoiceKey(n)))) return 0;
  const citedKeys = new Set(cited.map(invoiceKey));
  // Chỉ nhả khoản FIFO (đoán yếu). Khoản "đúng số tiền" của 1 hoá đơn là căn cứ mạnh nên giữ.
  const guessed = p.allocations.filter(
    (a) =>
      a.matchMethod === "FIFO" &&
      ![a.invoice.invoiceNumber, ...(a.invoice.supersedes ?? [])].some((n) => !!n && citedKeys.has(invoiceKey(n)))
  );
  if (guessed.length === 0) return 0;
  await db.$transaction(
    guessed.flatMap((a) => [
      db.debtPaymentAllocation.delete({ where: { id: a.id } }),
      db.debtInvoice.update({ where: { id: a.invoice.id }, data: { paidAmount: { decrement: Number(a.amount) } } }),
    ])
  );
  return guessed.reduce((s, a) => s + Number(a.amount), 0);
}

/** Chỉ số các dòng của file Tiền về mới TRÙNG (số tiền + nội dung giống hệt, ngày gần nhau hoặc ngày vô lý) với giao dịch đã ghi trước đó. */
export async function findFuzzyDuplicates(
  db: Db,
  rows: { amount: number; paymentDate: Date | null; rawDescription: string | null }[]
): Promise<Set<number>> {
  const dup = new Set<number>();
  const amounts = Array.from(new Set(rows.map((r) => r.amount)));
  if (amounts.length === 0) return dup;
  const existing = await db.debtPayment.findMany({
    where: { amount: { in: amounts } },
    select: { amount: true, paymentDate: true, rawDescription: true },
  });
  const keyed = existing.map((e) => ({ amount: Number(e.amount), date: e.paymentDate, descKey: paymentDescKey(e.rawDescription) }));
  rows.forEach((r, i) => {
    const k = { amount: r.amount, date: r.paymentDate, descKey: paymentDescKey(r.rawDescription) };
    if (keyed.some((e) => isFuzzyDuplicate(k, e))) dup.add(i);
  });
  return dup;
}

/** Xoá 1 khoản Tiền về (vd nhập trùng) và hoàn lại số đã thu trên các hoá đơn nó đã trừ. Trả về mã khách bị ảnh hưởng. */
export async function deletePaymentAndRelease(db: Db, paymentId: string): Promise<{ customerCode: string | null; released: number }> {
  const p = await db.debtPayment.findUnique({ where: { id: paymentId }, include: { allocations: true } });
  if (!p) return { customerCode: null, released: 0 };
  const ops = [
    ...p.allocations.map((a) => db.debtInvoice.update({ where: { id: a.invoiceId }, data: { paidAmount: { decrement: Number(a.amount) } } })),
    db.debtPayment.delete({ where: { id: p.id } }),
  ];
  await db.$transaction(ops);
  return { customerCode: p.customerCode, released: p.allocations.reduce((s, a) => s + Number(a.amount), 0) };
}
