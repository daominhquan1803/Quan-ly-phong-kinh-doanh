/**
 * Sua customerCode cua 1 Customer khi bi lech voi ma dang dung trong DebtInvoice/Order (thuong do
 * anh Quan go thua/thieu tien to khi tao khach thu cong, vd "C.INDUSTRIAL" thay vi "INDUSTRIAL")
 * - khien "tinh lai han thanh toan" / dong bo khong khop duoc hoa don nao. Tong quat hoa tu
 * repair-marukoh-customer-code.ts (truong hop dau tien, 2026-10-02). Mac dinh DRY-RUN.
 * Chay: npx tsx scripts/repair-customer-code.ts "<ma cu>" "<ma moi>" [--apply]
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");
const args = process.argv.slice(2).filter((a) => a !== "--apply");
const [OLD_CODE, NEW_CODE] = args;

async function main() {
  if (!OLD_CODE || !NEW_CODE) throw new Error('Can: "<ma cu>" "<ma moi>"');
  console.log(apply ? "=== GHI THAT ===" : "=== DRY-RUN ===");
  const c = await prisma.customer.findUnique({ where: { customerCode: OLD_CODE } });
  if (!c) {
    console.log(`Khong tim thay Customer voi customerCode="${OLD_CODE}" (co the da sua roi)`);
    return;
  }
  const existingNew = await prisma.customer.findUnique({ where: { customerCode: NEW_CODE } });
  if (existingNew) {
    console.log(`DA CO customerCode="${NEW_CODE}" (id=${existingNew.id}) - se bi trung, dung lai, kiem tra tay.`);
    return;
  }
  const invoiceCount = await prisma.debtInvoice.count({ where: { customerCode: NEW_CODE } });
  console.log(`Customer id=${c.id} name="${c.customerName}" code "${OLD_CODE}" -> "${NEW_CODE}" (${invoiceCount} hoa don dang dung ma moi)`);
  if (apply) {
    await prisma.customer.update({ where: { id: c.id }, data: { customerCode: NEW_CODE } });
    console.log("Da cap nhat.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
