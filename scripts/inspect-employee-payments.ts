/**
 * CHI DOC - doi chieu tien da thu cua tung NVKD: paidAmount (cot cong don tren hoa don) vs tong cac
 * khoan Tien ve da khop (DebtPaymentAllocation), liet ke khoan nhap TAY (sourceHash "manual:") va
 * hoa don bat thuong (da thu > so tien HD, hoac allocation > paidAmount). Dung chan doan
 * "thong ke cong no cua NVKD bi sai" sau khi co khoan Tien ve nhap sai.
 * Chay: npx tsx scripts/inspect-employee-payments.ts "<ten NVKD 1>" "<ten NVKD 2>" ...
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const names = process.argv.slice(2);
  if (names.length === 0) throw new Error("Thieu ten NVKD");
  for (const name of names) {
    const user = await prisma.user.findFirst({ where: { name: { contains: name } } });
    if (!user) {
      console.log(`\n### ${name}: khong tim thay user`);
      continue;
    }
    const invoices = await prisma.debtInvoice.findMany({
      where: { salesEmployeeId: user.id },
      select: {
        id: true, customerCode: true, customerName: true, invoiceNumber: true, invoiceDate: true,
        originalAmount: true, paidAmount: true,
        allocations: { select: { amount: true, matchMethod: true, payment: { select: { paymentDate: true, sourceHash: true, createdAt: true, note: true } } } },
      },
    });
    let sumOrig = 0, sumPaid = 0, sumAlloc = 0;
    const manual: string[] = [];
    const paidGtAlloc: string[] = [];
    const allocGtPaid: string[] = [];
    const overpaid: string[] = [];
    for (const inv of invoices) {
      const orig = Number(inv.originalAmount);
      const paid = Number(inv.paidAmount);
      const alloc = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
      sumOrig += orig; sumPaid += paid; sumAlloc += alloc;
      for (const a of inv.allocations) {
        if (a.payment.sourceHash.startsWith("manual:")) {
          manual.push(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | ${Number(a.amount)} | ngayVe=${a.payment.paymentDate?.toISOString().slice(0, 10) ?? "NULL"} | nhap=${a.payment.createdAt.toISOString().slice(0, 16)} | note=${a.payment.note ?? ""}`);
        }
      }
      if (paid > alloc + 0.5) paidGtAlloc.push(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | paid=${paid} alloc=${alloc} orig=${orig}`);
      if (alloc > paid + 0.5) allocGtPaid.push(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | paid=${paid} alloc=${alloc} orig=${orig}`);
      if (paid > orig + 0.5) overpaid.push(`  ${inv.customerCode} | HD ${inv.invoiceNumber} | paid=${paid} orig=${orig}`);
    }
    console.log(`\n### ${user.name}: ${invoices.length} hoa don | tong HD=${sumOrig} | tong paidAmount=${sumPaid} | tong allocation=${sumAlloc}`);
    console.log(`Khoan nhap TAY (${manual.length}):`); manual.slice(0, 60).forEach((l) => console.log(l));
    console.log(`paidAmount > tong allocation (da thu tu file Cong no goc, khong co allocation) (${paidGtAlloc.length}): hien 15 dau`); paidGtAlloc.slice(0, 15).forEach((l) => console.log(l));
    console.log(`allocation > paidAmount (BAT THUONG) (${allocGtPaid.length}):`); allocGtPaid.slice(0, 30).forEach((l) => console.log(l));
    console.log(`paidAmount > so tien HD (BAT THUONG) (${overpaid.length}):`); overpaid.slice(0, 30).forEach((l) => console.log(l));
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
