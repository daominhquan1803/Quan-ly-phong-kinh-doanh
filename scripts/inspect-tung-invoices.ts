/**
 * CHI DOC - kiem tra vi sao NVKD Ngo Thanh Tung khong thay hoa don thang 9 cua minh: doi chieu
 * salesEmployeeId cua DebtInvoice (ghi nhan luc import tu "Ma nhan vien" trong file Excel) voi
 * salesEmployeeId dang gan cho tung Customer (nguon dang tin cay hon, EM gan tay/import rieng).
 * Chay: npx tsx scripts/inspect-tung-invoices.ts
 */
import { prisma, normalizeCustomerCode } from "@hoanggia/db";

async function main() {
  const tung = await prisma.user.findFirst({ where: { name: { contains: "Ngô Thanh Tùng" } } });
  if (!tung) throw new Error("Khong tim thay user Ngo Thanh Tung");
  console.log(`User: id=${tung.id} amisEmployeeCode=${tung.amisEmployeeCode}`);

  const sept = await prisma.debtInvoice.findMany({
    where: { invoiceDate: { gte: new Date("2026-09-01T00:00:00+07:00"), lt: new Date("2026-10-01T00:00:00+07:00") }, source: "NEW_INVOICE" },
    select: { id: true, customerCode: true, customerName: true, invoiceNumber: true, salesEmployeeId: true, originalAmount: true },
  });
  console.log(`Tong hoa don NEW_INVOICE thang 9: ${sept.length}`);

  const directlyAssigned = sept.filter((i) => i.salesEmployeeId === tung.id);
  console.log(`Da gan truc tiep cho Tung (tu luc import): ${directlyAssigned.length}`);

  const customerCodes = Array.from(new Set(sept.map((i) => i.customerCode)));
  const customers = await prisma.customer.findMany({
    where: { customerCode: { in: customerCodes } },
    select: { customerCode: true, customerName: true, salesEmployeeId: true },
  });
  const customerByCode = new Map(customers.map((c) => [c.customerCode, c]));

  const shouldBeTungButNot: typeof sept = [];
  for (const inv of sept) {
    const cust = customerByCode.get(inv.customerCode);
    if (cust?.salesEmployeeId === tung.id && inv.salesEmployeeId !== tung.id) {
      shouldBeTungButNot.push(inv);
    }
  }
  console.log(`\nKhach thuoc Tung (Customer.salesEmployeeId) nhung hoa don KHONG gan cho Tung: ${shouldBeTungButNot.length}`);
  for (const i of shouldBeTungButNot.slice(0, 20)) {
    console.log(`  ${i.customerCode} | ${i.customerName} | so=${i.invoiceNumber} | salesEmployeeId hien tai=${i.salesEmployeeId ?? "NULL"} | ${i.originalAmount}`);
  }

  const noMatchCustomer = sept.filter((i) => !customerByCode.has(i.customerCode));
  console.log(`\nHoa don thang 9 KHONG khop duoc Customer nao (co the van con lech ma): ${noMatchCustomer.length}`);
  for (const i of noMatchCustomer.slice(0, 20)) {
    console.log(`  code="${i.customerCode}" | ${i.customerName} | so=${i.invoiceNumber}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
