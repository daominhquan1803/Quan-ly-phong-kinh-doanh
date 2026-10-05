/**
 * CHI DOC - xem cac hoa don vua duoc NVKD dien/sua ngay du kien thanh toan (updatedAt 48h gan day),
 * ngay co hop ly khong (nam la, ngay qua khu), va so hoa don con no chua co lich theo tung NVKD.
 * Chay: npx tsx scripts/inspect-expected-dates.ts
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const since = new Date(Date.now() - 48 * 3600 * 1000);
  const recent = await prisma.debtInvoice.findMany({
    where: { updatedAt: { gte: since }, expectedPaymentDate: { not: null } },
    select: { customerCode: true, invoiceNumber: true, expectedPaymentDate: true, updatedAt: true, originalAmount: true, paidAmount: true, salesEmployee: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  console.log(`Hoa don co ngay du kien va updatedAt 48h gan day: ${recent.length}`);
  const byEmp = new Map<string, number>();
  for (const i of recent) byEmp.set(i.salesEmployee?.name ?? "(chua gan)", (byEmp.get(i.salesEmployee?.name ?? "(chua gan)") ?? 0) + 1);
  for (const [e, n] of byEmp) console.log(`  ${e}: ${n}`);
  for (const i of recent.slice(0, 40)) {
    console.log(`  ${i.updatedAt.toISOString().slice(0, 16)} | ${i.salesEmployee?.name ?? "-"} | ${i.customerCode} | HD ${i.invoiceNumber} | du kien=${i.expectedPaymentDate?.toISOString()} | conLai=${Number(i.originalAmount) - Number(i.paidAmount)}`);
  }
  const odd = await prisma.debtInvoice.findMany({
    where: { expectedPaymentDate: { not: null }, OR: [{ expectedPaymentDate: { lt: new Date("2026-01-01") } }, { expectedPaymentDate: { gt: new Date("2027-06-30") } }] },
    select: { customerCode: true, invoiceNumber: true, expectedPaymentDate: true, salesEmployee: { select: { name: true } } },
    take: 30,
  });
  console.log(`\nNgay du kien bat thuong (truoc 2026 hoac sau 6/2027): ${odd.length}`);
  for (const i of odd) console.log(`  ${i.salesEmployee?.name ?? "-"} | ${i.customerCode} | HD ${i.invoiceNumber} | ${i.expectedPaymentDate?.toISOString()}`);
  const open = await prisma.debtInvoice.findMany({ where: { expectedPaymentDate: null }, select: { originalAmount: true, paidAmount: true, salesEmployee: { select: { name: true } } } });
  const noSch = new Map<string, number>();
  for (const i of open) if (Number(i.originalAmount) - Number(i.paidAmount) > 0) noSch.set(i.salesEmployee?.name ?? "(chua gan)", (noSch.get(i.salesEmployee?.name ?? "(chua gan)") ?? 0) + 1);
  console.log("\nHoa don con no CHUA co lich thanh toan theo NVKD:");
  for (const [e, n] of noSch) console.log(`  ${e}: ${n}`);
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
