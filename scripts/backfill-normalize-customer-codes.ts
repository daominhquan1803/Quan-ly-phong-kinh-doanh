/**
 * Chuan hoa customerCode cho TOAN BO Customer dang luu sai (con tien to "X." hoac dau cham cuoi)
 * - cung quy tac normalizeCustomerCode() da dung de khop voi DebtInvoice/Order. Phat hien sau 3
 * lan sua tay rieng le (Marukoh, HYX Industrial, Trang An) ngay 2026-10-02 - viec nay quet 1 lan
 * cho het, phong truong hop con sot. Mac dinh DRY-RUN; --apply de ghi that.
 * Chay: npx tsx scripts/backfill-normalize-customer-codes.ts [--apply]
 */
import { prisma, normalizeCustomerCode } from "@hoanggia/db";

const apply = process.argv.includes("--apply");

async function main() {
  console.log(apply ? "=== GHI THAT ===" : "=== DRY-RUN ===");
  const customers = await prisma.customer.findMany({ select: { id: true, customerCode: true, customerName: true } });
  const byNewCode = new Map<string, string[]>(); // newCode -> [customerCode cu trung nhau]
  for (const c of customers) {
    const norm = normalizeCustomerCode(c.customerCode);
    if (norm === c.customerCode) continue;
    const arr = byNewCode.get(norm) ?? [];
    arr.push(c.customerCode);
    byNewCode.set(norm, arr);
  }

  let fixCount = 0;
  let collisionCount = 0;
  for (const c of customers) {
    const norm = normalizeCustomerCode(c.customerCode);
    if (norm === c.customerCode) continue;
    const alreadyExists = customers.some((o) => o.id !== c.id && o.customerCode === norm);
    if (alreadyExists) {
      console.log(`BO QUA (trung ma "${norm}"): "${c.customerName}" code="${c.customerCode}"`);
      collisionCount++;
      continue;
    }
    console.log(`"${c.customerName}": "${c.customerCode}" -> "${norm}"`);
    fixCount++;
    if (apply) await prisma.customer.update({ where: { id: c.id }, data: { customerCode: norm } });
  }
  console.log(`\nTong: ${fixCount} da sua${apply ? "" : " (se sua)"}, ${collisionCount} bo qua vi trung ma (can kiem tra tay).`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
