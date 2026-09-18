/**
 * Sửa dữ liệu 1 lần: gán NVKD phụ trách (Customer.salesEmployeeId) cho các khách hàng đã tạo
 * từ file "Danh sách khách hàng.xlsx" TRƯỚC KHI tính năng này được thêm vào route import (chỉ
 * backfill, route import từ nay tự resolve NVKD cho lần nhập sau). Dữ liệu nguồn
 * data-customer-sales-employee.json là cặp [Mã khách hàng, Tên NVKD trong file gốc], trích xuất
 * 1 lần từ file Excel anh Quân gửi (18/09/2026) — CHỈ cập nhật khách hàng đang CHƯA có
 * salesEmployeeId, không ghi đè nếu admin đã tự sửa qua UI.
 *
 * Cách chạy: npx tsx scripts/backfill-customer-sales-employee.ts
 */
import { prisma, resolveEmployeeIdByName } from "@hoanggia/db";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const dataPath = path.join(__dirname, "data-customer-sales-employee.json");
  const entries: [string, string][] = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  console.log(`Tổng ${entries.length} dòng có NVKD trong file gốc.`);

  let updated = 0;
  let alreadySet = 0;
  let customerNotFound = 0;
  let employeeNotResolved = 0;
  const notResolvedNames = new Set<string>();

  for (const [code, empName] of entries) {
    const customer = await prisma.customer.findUnique({ where: { customerCode: code } });
    if (!customer) {
      customerNotFound++;
      continue;
    }
    if (customer.salesEmployeeId) {
      alreadySet++;
      continue;
    }
    const empId = await resolveEmployeeIdByName(empName);
    if (!empId) {
      employeeNotResolved++;
      notResolvedNames.add(empName);
      continue;
    }
    await prisma.customer.update({ where: { id: customer.id }, data: { salesEmployeeId: empId } });
    updated++;
  }

  console.log(`Đã cập nhật: ${updated}`);
  console.log(`Đã có sẵn từ trước (bỏ qua): ${alreadySet}`);
  console.log(`Không tìm thấy khách hàng (mã khác/đã xoá): ${customerNotFound}`);
  console.log(`Không nhận diện được tên NVKD: ${employeeNotResolved}`, Array.from(notResolvedNames));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
