/**
 * Chạy lại đồng bộ PoTrackingLine từ đơn AMIS (syncPoTrackingFromOrders) cho 1 số PO cụ thể — dùng để
 * kiểm chứng dòng AMIS được GỘP đúng vào dòng Excel (không tạo lại dòng trùng) sau khi dọn dữ liệu.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/sync-po-from-orders.ts <SỐ_PO> [<SỐ_PO> ...]
 */
import { prisma, syncPoTrackingFromOrders } from "@hoanggia/db";

async function main() {
  const codes = process.argv.slice(2);
  if (codes.length === 0) throw new Error("Thiếu Số PO");
  const r = await syncPoTrackingFromOrders(codes);
  console.log(JSON.stringify(r));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
