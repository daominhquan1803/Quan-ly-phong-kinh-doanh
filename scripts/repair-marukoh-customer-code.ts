/**
 * Sua ma khach hang MARUKOH bi go nham dau cham cuoi ("MARUKOH." -> "MARUKOH"), khien "tinh lai
 * han thanh toan" khong khop duoc hoa don nao (DebtInvoice.customerCode dung "MARUKOH" khong
 * cham). Mac dinh DRY-RUN; --apply de ghi that.
 * Chay: npx tsx scripts/repair-marukoh-customer-code.ts [--apply]
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");
const OLD_CODE = "MARUKOH.";
const NEW_CODE = "MARUKOH";

async function main() {
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
  console.log(`Customer id=${c.id} name="${c.customerName}" code "${OLD_CODE}" -> "${NEW_CODE}"`);
  if (apply) {
    await prisma.customer.update({ where: { id: c.id }, data: { customerCode: NEW_CODE } });
    console.log("Da cap nhat.");
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
