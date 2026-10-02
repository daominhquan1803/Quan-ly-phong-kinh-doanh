/**
 * CHI DOC - kiem tra vi sao "tinh lai han thanh toan" bao 0 hoa don cho 1 khach cu the.
 * Chay: npx tsx scripts/inspect-customer-debt-match.ts <tu khoa ten khach>
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const q = process.argv[2];
  if (!q) throw new Error("Thieu tu khoa ten khach");

  const customers = await prisma.customer.findMany({
    where: { customerName: { contains: q, mode: "insensitive" } },
    select: { id: true, customerCode: true, customerName: true, paymentTermType: true, paymentTermDays: true, paymentTermMonthOffset: true },
  });
  console.log(`Customer khop "${q}": ${customers.length}`);
  for (const c of customers) {
    console.log(`  code="${c.customerCode}" name="${c.customerName}" term=${c.paymentTermType} days=${c.paymentTermDays} monthOffset=${c.paymentTermMonthOffset}`);
  }

  const invoices = await prisma.debtInvoice.findMany({
    where: { customerName: { contains: q, mode: "insensitive" } },
    select: { customerCode: true, customerName: true, invoiceNumber: true, invoiceDate: true, dueDate: true, originalAmount: true, paidAmount: true, source: true },
    orderBy: { invoiceDate: "desc" },
    take: 20,
  });
  console.log(`\nDebtInvoice khop ten "${q}": ${invoices.length} (hien toi da 20)`);
  for (const i of invoices) {
    const remaining = Number(i.originalAmount) - Number(i.paidAmount);
    console.log(`  code="${i.customerCode}" name="${i.customerName}" so=${i.invoiceNumber} ngayCT=${i.invoiceDate?.toISOString().slice(0,10) ?? "NULL"} han=${i.dueDate?.toISOString().slice(0,10) ?? "NULL"} conLai=${remaining} nguon=${i.source}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
