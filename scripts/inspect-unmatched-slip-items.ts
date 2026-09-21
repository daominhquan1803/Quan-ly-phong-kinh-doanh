/**
 * CHỈ ĐỌC — liệt kê dòng hàng của Phiếu đi hàng KHÔNG khớp được dòng PO tracking (cùng cách khớp với
 * applyShipmentSlipDeliveries: Số PO + Mã hàng, rồi Tên hàng, rồi mã bỏ hậu tố ".N"), kèm phiếu chứa dòng
 * đó và gợi ý PO khác có cùng Mã hàng để biết lỗi nằm ở phiếu hay ở file PO.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-unmatched-slip-items.ts
 */
import { prisma } from "@hoanggia/db";

const d = (x: Date | null) => (x ? `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}` : "?");

async function main() {
  const items = await prisma.shipmentSlipItem.findMany({
    select: {
      itemCode: true, itemName: true, poSaleNumber: true, qtyActual: true,
      shipmentSlip: { select: { slipNumber: true, slipDate: true, customerName: true } },
    },
  });
  let unmatched = 0;
  for (const it of items) {
    const qty = Number(it.qtyActual ?? 0);
    if (!it.poSaleNumber || qty <= 0) {
      if (!it.poSaleNumber && qty > 0) {
        unmatched++;
        console.log(`THIẾU SỐ PO | phiếu ${it.shipmentSlip.slipNumber} ngày ${d(it.shipmentSlip.slipDate)} ${it.shipmentSlip.customerName ?? ""} | mã ${it.itemCode ?? "(trống)"} | ${it.itemName.slice(0, 40)} | SL ${qty}`);
        if (it.itemCode) {
          const other = await prisma.poTrackingLine.findMany({ where: { itemCode: { startsWith: it.itemCode } }, select: { poCode: true, itemCode: true, poDate: true } , take: 5 });
          console.log(`     PO tracking có mã này ở: ${other.map((o) => `${o.poCode}/${o.itemCode}`).join(", ") || "(không có)"}`);
        }
      }
      continue;
    }
    const stripped = it.itemCode ? it.itemCode.replace(/\.\d+$/, "") : null;
    const byCode = it.itemCode ? await prisma.poTrackingLine.count({ where: { poCode: it.poSaleNumber, itemCode: it.itemCode } }) : 0;
    const byName = byCode ? 1 : await prisma.poTrackingLine.count({ where: { poCode: it.poSaleNumber, itemName: it.itemName } });
    const byStripped = byCode || byName || !stripped || stripped === it.itemCode ? 1 : await prisma.poTrackingLine.count({ where: { poCode: it.poSaleNumber, itemCode: stripped } });
    if (byCode || byName || byStripped) continue;
    unmatched++;
    const poExists = await prisma.poTrackingLine.count({ where: { poCode: it.poSaleNumber } });
    const other = it.itemCode ? await prisma.poTrackingLine.findMany({ where: { itemCode: { startsWith: stripped ?? it.itemCode } }, select: { poCode: true, itemCode: true }, take: 5 }) : [];
    const otherByName = other.length ? [] : await prisma.poTrackingLine.findMany({ where: { itemName: it.itemName }, select: { poCode: true, itemCode: true }, take: 5 });
    console.log(`KHÔNG KHỚP PO | phiếu ${it.shipmentSlip.slipNumber} ngày ${d(it.shipmentSlip.slipDate)} ${it.shipmentSlip.customerName ?? ""} | PO ${it.poSaleNumber} (PO này ${poExists ? `có ${poExists} dòng trong PO tracking` : "KHÔNG có trong PO tracking"}) | mã ${it.itemCode ?? "(trống)"} | ${it.itemName.slice(0, 40)} | SL ${qty}`);
    console.log(`     mã/tên này có ở PO: ${[...other, ...otherByName].map((o) => `${o.poCode}/${o.itemCode}`).join(", ") || "(không PO nào)"}`);
  }
  console.log(`TỔNG dòng phiếu không khớp: ${unmatched} / ${items.length}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
