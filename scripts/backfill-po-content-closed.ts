/**
 * Backfill 1 lần cho 2 quy tắc đóng PO mới (anh Quân yêu cầu, áp dụng cho toàn bộ
 * PoTrackingLine đã có sẵn — các dòng nhập MỚI sau này đã tự áp dụng đúng qua
 * import-po-tracking.ts + computeLineDeliveryFields, không cần chạy lại script này):
 *
 * 1) Cột "Nội Dung" (ghi chú tự do, khác cột "Trạng thái") có nhắc huỷ/kết thúc → coi PO
 *    không cần giao tiếp, dù cột "Trạng thái" trong file gốc chưa kịp cập nhật — cập nhật
 *    baselineClosed = true cho các dòng này (xem contentIndicatesNoLongerNeeded).
 * 2) Dòng đang "Đang thực hiện" nhưng đã hết giá trị còn lại (remainingValue = 0) → tự
 *    chuyển "Kết thúc" (xem computeLineDeliveryFields, quy tắc noRemainingValue).
 *
 * Chỉ ghi lại DB cho các dòng THỰC SỰ đổi giá trị (so sánh trước/sau) — không rewrite toàn bộ
 * 23K+ dòng nếu không cần thiết.
 *
 * Cách chạy: npx tsx scripts/backfill-po-content-closed.ts [--dry-run]
 */
import {
  prisma,
  getSlipAggForAllLines,
  computeLineDeliveryFields,
  contentIndicatesNoLongerNeeded,
} from "@hoanggia/db";

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const lines = await prisma.poTrackingLine.findMany({
    select: {
      id: true,
      poCode: true,
      itemCode: true,
      itemName: true,
      content: true,
      poValue: true,
      poQuantity: true,
      baselineDeliveredValue: true,
      baselineDeliveredQty: true,
      baselineClosed: true,
      manuallyClosed: true,
      deliveredValue: true,
      remainingValue: true,
      totalDeliveredQty: true,
      remainingQty: true,
      statusRaw: true,
    },
  });
  console.log(`Tìm thấy ${lines.length} dòng PO cần rà soát.`);

  const slipAggByLine = await getSlipAggForAllLines();

  let contentClosedCount = 0;
  let updatedCount = 0;
  const contentClosedSamples: string[] = [];

  for (const l of lines) {
    const newBaselineClosed = l.baselineClosed || contentIndicatesNoLongerNeeded(l.content);
    if (newBaselineClosed && !l.baselineClosed) {
      contentClosedCount++;
      if (contentClosedSamples.length < 20) {
        contentClosedSamples.push(`${l.poCode} / ${l.itemCode ?? l.itemName ?? "?"} (Nội Dung: "${l.content}")`);
      }
    }

    const slipAgg = slipAggByLine.get(l.id) ?? { qty: 0, value: 0 };
    const computed = computeLineDeliveryFields(
      {
        poValue: Number(l.poValue),
        poQuantity: l.poQuantity != null ? Number(l.poQuantity) : null,
        baselineDeliveredValue: Number(l.baselineDeliveredValue),
        baselineDeliveredQty: l.baselineDeliveredQty != null ? Number(l.baselineDeliveredQty) : null,
        baselineClosed: newBaselineClosed,
        manuallyClosed: l.manuallyClosed,
      },
      slipAgg
    );

    const changed =
      newBaselineClosed !== l.baselineClosed ||
      computed.statusRaw !== l.statusRaw ||
      computed.deliveredValue !== Number(l.deliveredValue) ||
      computed.remainingValue !== Number(l.remainingValue) ||
      computed.totalDeliveredQty !== Number(l.totalDeliveredQty) ||
      computed.remainingQty !== (l.remainingQty != null ? Number(l.remainingQty) : null);

    if (changed) {
      updatedCount++;
      if (!dryRun) {
        await prisma.poTrackingLine.update({
          where: { id: l.id },
          data: { baselineClosed: newBaselineClosed, ...computed },
        });
      }
    }
  }

  console.log(`\n=== ${dryRun ? "DRY RUN (chưa ghi DB)" : "ĐÃ GHI DB"} ===`);
  console.log(`Dòng đóng thêm do Nội Dung ghi huỷ/kết thúc: ${contentClosedCount}`);
  if (contentClosedSamples.length) {
    console.log("Ví dụ (tối đa 20 dòng):");
    contentClosedSamples.forEach((s) => console.log("  -", s));
  }
  console.log(`Tổng số dòng có thay đổi (đóng theo Nội Dung + hết giá trị còn lại): ${updatedCount}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
