/**
 * CHỈ ĐỌC — in trạng thái giao hàng của mọi dòng 1 Số PO trong app: nền (file PO tracking), đợt giao,
 * Phiếu đi hàng chứa PO đó. Dùng khi nghi 1 PO đã giao mà app vẫn báo chưa giao.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-po.ts <SỐ_PO>
 */
import { prisma } from "@hoanggia/db";

const po = process.argv[2];
const d = (x: Date | null) => (x ? `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}` : "—");
const n = (x: unknown) => (x == null ? "—" : Number(x).toLocaleString("vi-VN"));

async function main() {
  const lines = await prisma.poTrackingLine.findMany({
    where: { poCode: po },
    include: { deliveryEvents: true, importBatch: { select: { fileName: true, createdAt: true } } },
    orderBy: { naturalKey: "asc" },
  });
  console.log(`PO ${po}: ${lines.length} dòng`);
  for (const l of lines) {
    console.log(
      `- ${l.itemCode ?? "?"} | ${(l.itemName ?? "").slice(0, 32)} | SL PO ${n(l.poQuantity)} | giá trị PO ${n(l.poValue)} | nền giao ${n(l.baselineDeliveredQty)}/${n(l.baselineDeliveredValue)} | tổng giao ${n(l.totalDeliveredQty)}/${n(l.deliveredValue)} | còn ${n(l.remainingQty)}/${n(l.remainingValue)} | ${l.statusRaw} | manuallyClosed=${l.manuallyClosed} | batch ${l.importBatch ? l.importBatch.createdAt.toISOString().slice(0, 16) : "(không - từ AMIS)"}`
    );
    for (const e of l.deliveryEvents) console.log(`    đợt giao ${d(e.eventDate)} SL ${n(e.quantity)} GT ${n(e.value)} ${e.sourceShipmentSlipId ? "(phiếu)" : "(Excel)"}`);
  }
  const items = await prisma.shipmentSlipItem.findMany({
    where: { poSaleNumber: po },
    select: { itemCode: true, itemName: true, qtyActual: true, shipmentSlip: { select: { slipNumber: true, slipDate: true } } },
  });
  console.log(`Dòng Phiếu đi hàng ghi Số PO này: ${items.length}`);
  for (const i of items) console.log(`  phiếu ${i.shipmentSlip.slipNumber} ngày ${d(i.shipmentSlip.slipDate)} | ${i.itemCode ?? "(trống)"} | ${i.itemName.slice(0, 30)} | SL ${n(i.qtyActual)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
