/**
 * CHI DOC - so sanh TUNG KY TU (char code) cua 1 ma khach hang giua Customer va DebtInvoice, de
 * bat loi ky tu an/khoang trang/hoa-thuong khac nhau du nhin giong het nhau tren man hinh.
 * Chay: npx tsx scripts/inspect-code-match.ts <tu khoa trong customerCode>
 */
import { prisma } from "@hoanggia/db";

function dump(label: string, s: string) {
  const codes = Array.from(s).map((ch) => `${ch}(${ch.charCodeAt(0)})`).join(" ");
  console.log(`  ${label}: "${s}" len=${s.length} -> ${codes}`);
}

async function main() {
  const q = process.argv[2];
  if (!q) throw new Error("Thieu tu khoa");

  const customers = await prisma.customer.findMany({
    where: { customerCode: { contains: q, mode: "insensitive" } },
    select: { customerCode: true, customerName: true },
  });
  console.log(`Customer co customerCode chua "${q}": ${customers.length}`);
  for (const c of customers) dump(`Customer "${c.customerName}"`, c.customerCode);

  const invoices = await prisma.debtInvoice.findMany({
    where: { customerCode: { contains: q, mode: "insensitive" } },
    select: { customerCode: true, customerName: true },
    distinct: ["customerCode"],
  });
  console.log(`\nDebtInvoice co customerCode chua "${q}" (distinct): ${invoices.length}`);
  for (const i of invoices) dump(`DebtInvoice "${i.customerName}"`, i.customerCode);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
