/**
 * Chạy lại việc sinh đợt giao từ TOÀN BỘ Phiếu đi hàng (giống nút "Đồng bộ lại giao hàng") — dùng sau khi
 * sửa mốc "nền đã bao gồm" (baselineSlipCutoff: 00:00 giờ VN ngày nhập file PO tracking, thay vì đúng thời
 * điểm nhập) để phục hồi đợt giao của các Phiếu ngày 17/09 trở đi từng bị loại nhầm. An toàn chạy lặp lại.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/resync-slip-deliveries.ts
 */
import { prisma, resyncAllShipmentSlipDeliveries } from "@hoanggia/db";

async function main() {
  const r = await resyncAllShipmentSlipDeliveries();
  console.log(`Phiếu: ${r.totalSlips}; dòng hàng khớp: ${r.totalMatched}; dòng không khớp: ${r.totalUnmatchedItems}`);
  r.unmatchedSamples.slice(0, 15).forEach((u) => console.log("  không khớp:", u));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
