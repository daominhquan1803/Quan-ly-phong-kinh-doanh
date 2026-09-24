/**
 * CHỈ ĐỌC — in dòng hàng của đơn AMIS (Order/OrderItem) theo Số PO, để biết AMIS ghi mấy dòng, mã gì.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-order-items.ts <SỐ_PO> [...]
 */
import { prisma } from "@hoanggia/db";

async function main() {
  for (const po of process.argv.slice(2)) {
    const o = await prisma.order.findUnique({ where: { orderCode: po }, include: { items: { orderBy: { lineOrder: "asc" } } } });
    if (!o) { console.log(`${po}: không có đơn AMIS`); continue; }
    console.log(`${po}: đơn AMIS ${o.items.length} dòng, nguồn ${o.source}, hạn giao ${o.expectedDeliveryDate?.toISOString().slice(0, 10)}`);
    for (const i of o.items) console.log(`  ${i.lineOrder} | ${i.itemCode ?? "?"} | ${i.itemName.slice(0, 32)} | SL ${Number(i.quantity)} | giá ${Number(i.unitPrice)}`);
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
