/**
 * Gan lai salesEmployeeId cho DebtInvoice dang NULL, theo NVKD da duoc gan san cho Customer tuong
 * ung (customerCode) - fix cho du lieu da import TRUOC khi co fallback trong code (xem
 * apps/web/src/app/api/debt/import/new-invoices/route.ts, sua 02/10/2026: file "HD T9.xlsx" 148
 * dong khong dong nao khop duoc "Ma nhan vien" trong file, khien NVKD khong thay hoa don cua
 * minh du khach da co NVKD phu trach ro rang). Mac dinh DRY-RUN; --apply de ghi that.
 * Chay: npx tsx scripts/backfill-invoice-employee-from-customer.ts [--apply]
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "=== GHI THAT ===" : "=== DRY-RUN ===");
  const invoices = await prisma.debtInvoice.findMany({
    where: { salesEmployeeId: null },
    select: { id: true, customerCode: true, customerName: true, invoiceNumber: true, invoiceDate: true },
  });
  const customers = await prisma.customer.findMany({
    where: { customerCode: { in: Array.from(new Set(invoices.map((i) => i.customerCode))) }, salesEmployeeId: { not: null } },
    select: { customerCode: true, salesEmployeeId: true, customerName: true },
  });
  const empByCode = new Map(customers.map((c) => [c.customerCode, c.salesEmployeeId!]));

  const byEmployee = new Map<string, number>();
  let fixCount = 0;
  for (const inv of invoices) {
    const empId = empByCode.get(inv.customerCode);
    if (!empId) continue;
    fixCount++;
    byEmployee.set(empId, (byEmployee.get(empId) ?? 0) + 1);
    if (apply) await prisma.debtInvoice.update({ where: { id: inv.id }, data: { salesEmployeeId: empId } });
  }

  console.log(`Hoa don dang salesEmployeeId=NULL: ${invoices.length}`);
  console.log(`Gan lai duoc tu Customer: ${fixCount}`);
  if (fixCount > 0) {
    const users = await prisma.user.findMany({ where: { id: { in: Array.from(byEmployee.keys()) } }, select: { id: true, name: true } });
    const nameById = new Map(users.map((u) => [u.id, u.name]));
    for (const [empId, count] of byEmployee) console.log(`  ${nameById.get(empId) ?? empId}: ${count} hoa don`);
  }
  console.log(`Con lai khong gan duoc (khach chua co NVKD o trang Khach hang, hoac khach chua ton tai): ${invoices.length - fixCount}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
