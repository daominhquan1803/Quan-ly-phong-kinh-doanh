/**
 * CHI DOC - doi voi tung cap (ma cu, ma moi) ung vien tu backfill-normalize-customer-codes, dem so
 * DebtInvoice dang dung MA CU va MA MOI de xac nhan huong sua dung truoc khi apply hang loat (tranh
 * truong hop ma "bi tru nham" thuc ra la ma that, vd "H.N.P" la ten cong ty that, khong phai tien to).
 * Chay: npx tsx scripts/verify-code-candidates.ts
 */
import { prisma } from "@hoanggia/db";

const CANDIDATES: [string, string][] = [
  ["H.N.P", "N.P"],
  ["MAGNETIC.", "MAGNETIC"],
  ["MINHDUC.", "MINHDUC"],
  ["Ms Ngân 1", "MS NGÂN 1"],
  ["PB-GLOBAL.", "PB-GLOBAL"],
  ["P.KDOANH", "KDOANH"],
  ["TANMAI.", "TANMAI"],
  ["T.HUNGTHINHH", "HUNGTHINHH"],
  ["BUJEON VIETNAM ELECTRONICS.", "BUJEON VIETNAM ELECTRONICS"],
];

async function main() {
  for (const [oldCode, newCode] of CANDIDATES) {
    const [oldCount, newCount] = await Promise.all([
      prisma.debtInvoice.count({ where: { customerCode: oldCode } }),
      prisma.debtInvoice.count({ where: { customerCode: newCode } }),
    ]);
    console.log(`"${oldCode}" (${oldCount} hoa don) -> "${newCode}" (${newCount} hoa don)`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
