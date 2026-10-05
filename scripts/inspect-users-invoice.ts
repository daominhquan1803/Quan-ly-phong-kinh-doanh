/**
 * CHI DOC - liet ke user (ten, email, role, active, ma AMIS, so hoa don dang gan) va chi tiet 1 hoa don
 * theo so, de tra vi sao 1 NVKD khong thay hoa don trong che do xem cua minh.
 * Chay: npx tsx scripts/inspect-users-invoice.ts <so hoa don>
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const no = process.argv[2];
  const users = await prisma.user.findMany({ orderBy: { name: "asc" } });
  console.log("User:");
  for (const u of users) {
    const n = await prisma.debtInvoice.count({ where: { salesEmployeeId: u.id } });
    console.log(`  id=${u.id} | ${u.name} | ${u.email} | ${u.role} | active=${u.active} | amis=${u.amisEmployeeCode} | ${n} hoa don`);
  }
  const invs = await prisma.debtInvoice.findMany({
    where: { invoiceNumber: { contains: no } },
    include: { salesEmployee: { select: { id: true, name: true, email: true } } },
  });
  console.log(`\nHoa don so chua "${no}": ${invs.length}`);
  for (const i of invs) {
    console.log(`  ${i.customerCode} | ${i.customerName} | HD ${i.invoiceNumber} | ngayCT=${i.invoiceDate?.toISOString()} | han=${i.dueDate?.toISOString()} | orig=${i.originalAmount} paid=${i.paidAmount} | NVKD=${i.salesEmployee?.name} (${i.salesEmployee?.id} ${i.salesEmployee?.email}) | nguon=${i.source}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
