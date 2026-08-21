/**
 * Backfill 1 lần cho tính năng "Phiếu đi hàng tự sinh đợt giao" — chạy đúng 1 lần ngay sau khi
 * thêm cột baselineDeliveredValue/baselineDeliveredQty/baselineClosed, TRƯỚC KHI bất kỳ Phiếu
 * đi hàng nào được nhập (nếu chạy muộn hơn, các dòng PO đã có đợt giao từ Phiếu đi hàng sẽ bị
 * tính lại sai vì baseline mặc định = 0).
 *
 * Chép nguyên deliveredValue/totalDeliveredQty/statusRaw hiện tại (đã đúng, từ lần nhập file PO
 * tracking Excel gần nhất) vào baselineDeliveredValue/baselineDeliveredQty/baselineClosed —
 * giữ nguyên các trường hiển thị (deliveredValue...) không đổi, chỉ thêm "nền" cho các lần tính
 * lại sau này khi có đợt giao qua Phiếu đi hàng.
 *
 * Cách chạy: npx tsx scripts/backfill-po-tracking-baseline.ts [--dry-run]
 */
import { prisma } from "@hoanggia/db";

const CLOSED_STATUS = "kết thúc";
function normStatus(s: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const already = await prisma.poTrackingLine.count({
    where: { OR: [{ baselineDeliveredValue: { gt: 0 } }, { baselineClosed: true }] },
  });
  if (already > 0) {
    console.error(
      `Đã có ${already} dòng PO có baseline khác mặc định — có vẻ script này đã chạy rồi (hoặc đã có Phiếu đi hàng cập nhật baseline qua đường khác). Dừng lại để tránh ghi đè nhầm.`
    );
    process.exit(1);
  }

  const lines = await prisma.poTrackingLine.findMany({
    select: { id: true, deliveredValue: true, totalDeliveredQty: true, statusRaw: true },
  });
  console.log(`Tìm thấy ${lines.length} dòng PO cần backfill baseline.`);

  let updated = 0;
  for (const l of lines) {
    const baselineClosed = normStatus(l.statusRaw) === CLOSED_STATUS;
    if (!dryRun) {
      await prisma.poTrackingLine.update({
        where: { id: l.id },
        data: {
          baselineDeliveredValue: l.deliveredValue,
          baselineDeliveredQty: l.totalDeliveredQty,
          baselineClosed,
        },
      });
    }
    updated++;
  }

  console.log(`\n=== ${dryRun ? "DRY RUN (chưa ghi DB)" : "ĐÃ GHI DB"} ===`);
  console.log(`Đã backfill: ${updated} dòng.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
