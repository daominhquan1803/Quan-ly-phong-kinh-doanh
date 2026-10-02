/**
 * CHI DOC - xem cac lan import cong no gan day (baseline/new-invoices/payments) de chan doan
 * vi sao hoa don thang 9 anh Quan up len khong thay hien trong danh sach Cong no.
 * Chay: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-debt-import-batches.ts
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const batches = await prisma.debtImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  for (const b of batches) {
    console.log(
      `${b.createdAt.toISOString()} | ${b.type} | file=${b.fileName} | total=${b.totalRows} created=${b.createdCount} updated=${b.updatedCount} err=${b.errorCount}`
    );
    if (b.errorReport) console.log("  errors:", JSON.stringify(b.errorReport).slice(0, 500));
  }

  const sept = await prisma.debtInvoice.findMany({
    where: { invoiceDate: { gte: new Date("2026-09-01T00:00:00+07:00"), lt: new Date("2026-10-01T00:00:00+07:00") } },
    select: { customerCode: true, customerName: true, invoiceNumber: true, invoiceDate: true, dueDate: true, originalAmount: true, source: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`\nHoa don co invoiceDate thang 9/2026: ${sept.length} dong (hien 20 dau)`);
  for (const i of sept) {
    console.log(`  ${i.customerCode} | ${i.invoiceNumber} | ngayCT=${i.invoiceDate?.toISOString().slice(0,10)} | han=${i.dueDate?.toISOString().slice(0,10) ?? "NULL"} | ${i.originalAmount} | ${i.source} | created=${i.createdAt.toISOString()}`);
  }

  const countNoDue = await prisma.debtInvoice.count({ where: { dueDate: null } });
  console.log(`\nTong hoa don dueDate=NULL (co the bi day xuong cuoi danh sach): ${countNoDue}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
