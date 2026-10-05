/**
 * CHI DOC - xem lai ti le no qua han cua tung NVKD: chia con no con lai theo trang thai (no xau, qua
 * han, sap den han, con han, CHUA CO HAN), liet ke hoa don chua co han / han lech quy chuan khach.
 * Chay: npx tsx scripts/inspect-overdue-employee.ts "<ten NVKD>" ...
 */
import { prisma } from "@hoanggia/db";
import { computeDueDateFromTerm } from "../apps/web/src/lib/customer-payment-term";

const DAY = 86400000;
function days(due: Date, today: Date): number {
  const a = new Date(due); a.setHours(0, 0, 0, 0);
  const b = new Date(today); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

async function main() {
  const today = new Date();
  for (const name of process.argv.slice(2)) {
    const user = await prisma.user.findFirst({ where: { name: { contains: name } } });
    if (!user) { console.log(`### ${name}: khong co user`); continue; }
    const invoices = await prisma.debtInvoice.findMany({ where: { salesEmployeeId: user.id } });
    const customers = await prisma.customer.findMany({ where: { customerCode: { in: Array.from(new Set(invoices.map((i) => i.customerCode))) } } });
    const termBy = new Map(customers.map((c) => [c.customerCode, c]));
    const b: Record<string, { n: number; amt: number }> = {};
    const add = (k: string, amt: number) => { (b[k] ??= { n: 0, amt: 0 }); b[k].n++; b[k].amt += amt; };
    const noDue: string[] = [];
    const mismatch: string[] = [];
    let total = 0;
    for (const inv of invoices) {
      const rem = Number(inv.originalAmount) - Number(inv.paidAmount);
      if (rem <= 0) { add("DA THU/AM", 0); continue; }
      total += rem;
      if (!inv.dueDate) { add("CHUA CO HAN", rem); noDue.push(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | ngayCT=${inv.invoiceDate?.toISOString().slice(0, 10)} | ${rem} | khach co quy chuan: ${termBy.get(inv.customerCode)?.paymentTermType ?? "KHONG"}`); continue; }
      const d = days(inv.dueDate, today);
      add(d > 180 ? "NO XAU" : d > 0 ? "QUA HAN" : d >= -7 ? "SAP DEN HAN" : "CON HAN", rem);
      const term = termBy.get(inv.customerCode);
      const exp = term?.paymentTermType ? computeDueDateFromTerm(inv.invoiceDate, term as never) : null;
      if (exp && exp.getTime() !== inv.dueDate.getTime()) mismatch.push(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | han=${inv.dueDate.toISOString().slice(0, 10)} theo quy chuan=${exp.toISOString().slice(0, 10)} | ${rem}`);
    }
    console.log(`\n### ${user.name}: tong con no=${total}`);
    for (const [k, v] of Object.entries(b)) console.log(`  ${k}: ${v.n} hoa don, ${v.amt} (${total ? ((v.amt / total) * 100).toFixed(1) : 0}%)`);
    console.log(`Chua co han (${noDue.length}) - hien 25:`); noDue.slice(0, 25).forEach((l) => console.log(l));
    console.log(`Han lech quy chuan khach (${mismatch.length}) - hien 25:`); mismatch.slice(0, 25).forEach((l) => console.log(l));
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
