/**
 * Backfill 1 lần cho tính năng theo dõi delta giá trị đã giao (OrderDeliveryEvent) — chạy
 * đúng 1 lần khi thêm tính năng, để mọi đơn ĐÃ có deliveredValue > 0 từ trước (chưa từng được
 * ghi delta) có ngay 1 dòng lịch sử ban đầu, tránh "Doanh số" các tháng bỗng dưng về 0 cho tới
 * khi có đợt đồng bộ mới.
 *
 * Vì không có lịch sử thật (AMIS chỉ cho biết đến nay đã giao bao nhiêu, giao lần gần nhất
 * ngày nào — không có breakdown từng đợt), mỗi đơn được ghi ĐÚNG 1 delta duy nhất bằng toàn bộ
 * deliveredValue hiện tại, mốc ngày lấy actualDeliveryDate (ưu tiên) rồi orderDate rồi
 * createdAt. Đây là xấp xỉ tốt nhất có thể — với đơn đã giao nhiều đợt trải nhiều tháng (như
 * D07.26MQ09A giao cả tháng 7 lẫn tháng 8), toàn bộ giá trị sẽ dồn vào đúng 1 tháng (tháng của
 * actualDeliveryDate — tức đợt giao GẦN NHẤT) giống hệt cách tính cũ, CHỈ tính từ lần chạy
 * script này trở đi các đợt giao tiếp theo mới được tách đúng theo từng tháng.
 *
 * Cách chạy: npx tsx scripts/backfill-order-delivery-events.ts [--dry-run]
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const alreadyBackfilled = await prisma.orderDeliveryEvent.count();
  if (alreadyBackfilled > 0) {
    console.error(
      `Đã có ${alreadyBackfilled} OrderDeliveryEvent trong hệ thống — script này chỉ chạy 1 lần lúc bảng còn trống, để tránh backfill chồng lấn với delta đã ghi qua đồng bộ AMIS. Dừng lại.`
    );
    process.exit(1);
  }

  const orders = await prisma.order.findMany({
    where: { deliveredValue: { gt: 0 } },
    select: {
      id: true,
      orderCode: true,
      salesEmployeeId: true,
      deliveredValue: true,
      actualDeliveryDate: true,
      orderDate: true,
      createdAt: true,
    },
  });

  console.log(`Tìm thấy ${orders.length} đơn có deliveredValue > 0 cần backfill.`);

  let created = 0;
  let skippedNoEmployee = 0;
  let totalValue = 0;

  for (const o of orders) {
    if (!o.salesEmployeeId) {
      skippedNoEmployee++;
      continue;
    }
    const occurredAt = o.actualDeliveryDate ?? o.orderDate ?? o.createdAt;
    const deliveredValue = Number(o.deliveredValue);
    totalValue += deliveredValue;

    if (!dryRun) {
      await prisma.orderDeliveryEvent.create({
        data: {
          orderId: o.id,
          salesEmployeeId: o.salesEmployeeId,
          deltaValue: deliveredValue,
          deliveredValueAfter: deliveredValue,
          occurredAt,
        },
      });
    }
    created++;
  }

  console.log(`\n=== ${dryRun ? "DRY RUN (chưa ghi DB)" : "ĐÃ GHI DB"} ===`);
  console.log(`Đã tạo: ${created} delta — tổng giá trị: ${totalValue.toLocaleString("vi-VN")}đ`);
  console.log(`Bỏ qua (không có salesEmployeeId): ${skippedNoEmployee}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
