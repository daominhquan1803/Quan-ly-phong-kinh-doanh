/**
 * Gan han thanh toan (dueDate) cho hoa don CON NO, dang NULL, ma khach da co quy chuan han no (trang
 * Khach hang) - truong hop khach duoc tao/sua ma SAU khi hoa don da import nen chua tinh han (vd
 * TRANGAN HD 00002855, 05/10/2026). Khong dung vao hoa don da co han. Mac dinh DRY-RUN; --apply de ghi.
 * Chay: npx tsx scripts/backfill-due-dates-from-terms.ts [--apply]
 */
import { prisma } from "@hoanggia/db";
import { computeDueDateFromTerm } from "../apps/web/src/lib/customer-payment-term";

const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "=== GHI THAT ===" : "=== DRY-RUN ===");
  const invoices = await prisma.debtInvoice.findMany({
    where: { dueDate: null, invoiceDate: { not: null } },
    select: { id: true, customerCode: true, invoiceNumber: true, invoiceDate: true, originalAmount: true, paidAmount: true, salesEmployee: { select: { name: true } } },
  });
  const customers = await prisma.customer.findMany({ where: { paymentTermType: { not: null } } });
  const termBy = new Map(customers.map((c) => [c.customerCode, c]));
  let fix = 0, sum = 0, noTerm = 0;
  const byEmp = new Map<string, number>();
  for (const inv of invoices) {
    const rem = Number(inv.originalAmount) - Number(inv.paidAmount);
    if (rem <= 0) continue;
    const term = termBy.get(inv.customerCode);
    if (!term) { noTerm++; continue; }
    const due = computeDueDateFromTerm(inv.invoiceDate, term as never);
    if (!due) continue;
    fix++; sum += rem;
    const emp = inv.salesEmployee?.name ?? "(chua gan)";
    byEmp.set(emp, (byEmp.get(emp) ?? 0) + 1);
    console.log(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | ${rem} | han moi=${due.toISOString().slice(0, 10)} | ${emp}`);
    if (apply) await prisma.debtInvoice.update({ where: { id: inv.id }, data: { dueDate: due } });
  }
  console.log(`\nHoa don con no, chua co han, khach da co quy chuan: ${fix} (tong ${sum})`);
  for (const [e, n] of byEmp) console.log(`  ${e}: ${n}`);
  console.log(`Con lai chua co han vi khach CHUA co quy chuan: ${noTerm}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
