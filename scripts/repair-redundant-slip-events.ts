/**
 * Sửa dữ liệu 1 lần: xoá các PoDeliveryEvent nguồn Phiếu đi hàng (sourceShipmentSlipId khác null)
 * đã bị TÍNH TRÙNG với lần nhập lại file PO tracking Excel gần nhất — gây doanh số Kế hoạch kinh
 * doanh tháng 9/2026 tăng gần gấp đôi (anh Quân phát hiện, xem trao đổi 17-18/09/2026).
 *
 * Nguyên nhân: file PO tracking Excel được nhập lại lần 2 vào 17/09 (đè "nền" — baselineDeliveredValue)
 * trong lúc kiểm tra tính năng, sau khi 123 Phiếu đi hàng đã ghi nhận các đợt giao 31/08–15/09 rồi.
 * File Excel "1609" (16/09) đã CHỨA SẴN các đợt giao đó trong cột đợt giao — nhưng
 * computeLineDeliveryFields (po-delivery-sync.ts) luôn CỘNG THÊM Phiếu đi hàng lên trên nền,
 * không biết nền mới đã bao gồm rồi → đếm 2 lần.
 *
 * Phạm vi xoá: CHỈ các PoDeliveryEvent nguồn Phiếu đi hàng có eventDate TRƯỚC thời điểm nhập lại
 * file PO tracking gần nhất (PoTrackingImportBatch mới nhất), và CHỈ trên các dòng PoTrackingLine
 * thực sự thuộc lần nhập đó (importBatchId = batch mới nhất) — không đụng Phiếu đi hàng sau thời
 * điểm nhập lại (chưa được nền mới hấp thụ) hay dòng PO không thuộc lần nhập lại này.
 *
 * Sau khi xoá, tính lại deliveredValue/remainingValue/totalDeliveredQty/remainingQty/statusRaw cho
 * từng dòng bị ảnh hưởng qua recomputeLineDeliveryFields (nền giữ nguyên, chỉ bỏ phần slip trùng).
 *
 * Cách chạy: npx tsx scripts/repair-redundant-slip-events.ts [--dry-run]
 */
import { prisma, recomputeLineDeliveryFields } from "@hoanggia/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const latestBatch = await prisma.poTrackingImportBatch.findFirst({
    where: { completedAt: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, fileName: true, createdAt: true },
  });
  if (!latestBatch) {
    console.log("Không tìm thấy lần nhập file PO tracking nào — không có gì để sửa.");
    return;
  }
  console.log(`Lần nhập file PO tracking gần nhất: "${latestBatch.fileName}" lúc ${latestBatch.createdAt.toISOString()}`);

  const affectedLines = await prisma.poTrackingLine.findMany({
    where: { importBatchId: latestBatch.id },
    select: { id: true },
  });
  const affectedLineIds = affectedLines.map((l) => l.id);
  console.log(`Số dòng PO thuộc lần nhập này: ${affectedLineIds.length}`);

  const redundantEvents = await prisma.poDeliveryEvent.findMany({
    where: {
      lineId: { in: affectedLineIds },
      sourceShipmentSlipId: { not: null },
      eventDate: { lt: latestBatch.createdAt },
    },
    select: { id: true, lineId: true, value: true, eventDate: true, line: { select: { poCode: true, itemCode: true } } },
  });

  const totalValue = redundantEvents.reduce((s, e) => s + Number(e.value), 0);
  console.log(`\nTìm thấy ${redundantEvents.length} đợt giao (Phiếu đi hàng) bị trùng, tổng giá trị: ${totalValue.toLocaleString("vi-VN")}đ`);
  const byPo = new Map<string, number>();
  for (const e of redundantEvents) {
    const key = `${e.line.poCode} / ${e.line.itemCode ?? "?"}`;
    byPo.set(key, (byPo.get(key) ?? 0) + Number(e.value));
  }
  const sorted = Array.from(byPo.entries()).sort((a, b) => b[1] - a[1]);
  console.log("\nTop 20 PO bị ảnh hưởng nhiều nhất:");
  for (const [key, val] of sorted.slice(0, 20)) {
    console.log(`  - ${key}: ${val.toLocaleString("vi-VN")}đ`);
  }

  if (dryRun) {
    console.log("\n=== DRY RUN — chưa xoá gì ===");
    return;
  }

  const affectedLineIdSet = new Set(redundantEvents.map((e) => e.lineId));
  const eventIds = redundantEvents.map((e) => e.id);
  if (eventIds.length > 0) {
    await prisma.poDeliveryEvent.deleteMany({ where: { id: { in: eventIds } } });
  }
  for (const lineId of affectedLineIdSet) {
    await recomputeLineDeliveryFields(lineId);
  }
  console.log(`\n=== ĐÃ XOÁ ${eventIds.length} đợt giao trùng, tính lại ${affectedLineIdSet.size} dòng PO ===`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
