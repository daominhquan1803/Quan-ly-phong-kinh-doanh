/**
 * Nhập/cập nhật file Excel theo dõi PO + giao hàng độc lập (không qua AMIS) — anh Quân gửi
 * file này định kỳ (thường hàng ngày), mỗi lần gửi là 1 bản snapshot đầy đủ, chạy lại import
 * này sẽ tự cập nhật đúng các dòng đã có (theo naturalKey) và tạo mới các dòng chưa từng thấy.
 *
 * Logic parse + ghi DB nằm ở packages/db/src/po-tracking-import.ts — dùng CHUNG với route upload
 * trong app (Tiến độ giao hàng → "Nhập file PO tracking"), file này chỉ còn là wrapper CLI cho
 * trường hợp cần chạy tay qua SSH.
 *
 * Cách dùng: npx tsx scripts/import-po-tracking.ts <file.xlsx> <email người chạy>
 */
import { readFileSync } from "fs";
import path from "path";
import { prisma, parsePoTrackingExcel, createPoTrackingImportBatch, importPoTrackingRows } from "@hoanggia/db";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const excelPathArg = args[0];
const runByEmail = args[1];

if (!excelPathArg || !runByEmail) {
  console.error("Cách dùng: npx tsx scripts/import-po-tracking.ts <file.xlsx> <email người chạy>");
  process.exit(1);
}
const EXCEL_PATH = path.resolve(excelPathArg);

async function main() {
  const runner = await prisma.user.findUnique({ where: { email: runByEmail } });
  if (!runner) {
    console.error(`Không tìm thấy tài khoản với email "${runByEmail}"`);
    process.exit(1);
  }

  const buffer = readFileSync(EXCEL_PATH);
  const rows = parsePoTrackingExcel(buffer);
  console.log(`Đọc được ${rows.length} dòng có Số PO từ file.`);

  const batch = await createPoTrackingImportBatch({ fileName: path.basename(EXCEL_PATH), createdById: runner.id });
  const result = await importPoTrackingRows(rows, batch.id);

  console.log(`\n=== ĐÃ GHI DB ===`);
  console.log(`Tạo mới: ${result.createdCount}`);
  console.log(`Cập nhật: ${result.updatedCount}`);
  console.log(`Lỗi: ${result.errorCount}`);
  if (result.errors.length) {
    console.log("\nChi tiết lỗi (tối đa 20 dòng đầu):");
    result.errors.slice(0, 20).forEach((e) => console.log("  -", e));
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
