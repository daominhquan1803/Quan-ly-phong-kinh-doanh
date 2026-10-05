/**
 * CHI DOC - liet ke tung hoa don cua 1 khach (hoac cua 1 NVKD) tai 1 ngay qua khu, cung cong thuc voi
 * /api/debt/summary?asOfDate: da thu den ngay do, trang thai/so ngay qua han so voi ngay do.
 * Chay: npx tsx scripts/inspect-asof-customer.ts "<ten NVKD>" <YYYY-MM-DD> [tu khoa ma khach]
 */
import { prisma } from "@hoanggia/db";
import { computeDebtStatus, overdueDays } from "../apps/web/src/lib/debt-status";

async function main() {
  const [name, dateStr, codeKw] = process.argv.slice(2);
  const asOf = new Date(`${dateStr}T00:00:00+07:00`);
  const user = await prisma.user.findFirst({ where: { name: { contains: name } } });
  if (!user) throw new Error("khong co user");
  const invoices = await prisma.debtInvoice.findMany({
    where: { salesEmployeeId: user.id, ...(codeKw ? { customerCode: { contains: codeKw, mode: "insensitive" } } : {}) },
    include: { allocations: { select: { amount: true, payment: { select: { paymentDate: true, sourceHash: true } } } } },
    orderBy: { dueDate: "asc" },
  });
  let sumOver = 0, sumAll = 0, skipped = 0;
  for (const inv of invoices) {
    if (inv.invoiceDate && inv.invoiceDate > asOf) { skipped++; continue; }
    const orig = Number(inv.originalAmount);
    const allAlloc = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const allocAsOf = inv.allocations.filter((a) => a.payment.paymentDate && a.payment.paymentDate <= asOf).reduce((s, a) => s + Number(a.amount), 0);
    const paid = Math.max(0, Number(inv.paidAmount) - allAlloc) + allocAsOf;
    const rem = Math.max(0, orig - paid);
    const st = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: orig, paidAmount: paid }, asOf);
    sumAll += rem;
    if (st === "OVERDUE" || st === "BAD_DEBT") sumOver += rem;
    if (codeKw && rem > 0) {
      console.log(`${inv.customerCode} | HD ${inv.invoiceNumber} | ngayCT=${inv.invoiceDate?.toISOString().slice(0, 10)} | han=${inv.dueDate?.toISOString().slice(0, 10) ?? "NULL"} | orig=${orig} paidNow=${Number(inv.paidAmount)} paidAsOf=${paid} | conLai=${rem} | ${st} (${inv.dueDate ? overdueDays(inv.dueDate, asOf) : "-"} ngay) | tien ve: ${inv.allocations.map((a) => `${Number(a.amount)}@${a.payment.paymentDate?.toISOString().slice(0, 10)}`).join(",")}`);
    }
  }
  console.log(`\n${user.name} tai ${dateStr}: tong con no=${sumAll} | qua han=${sumOver} | bo qua (chua phat sinh)=${skipped}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
