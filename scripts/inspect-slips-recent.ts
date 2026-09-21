/**
 * CHỈ ĐỌC — Phiếu đi hàng ngày 17-22/09/2026 và đợt giao đã sinh từ chúng, để tìm dòng hàng nào của file
 * PO tracking (đã giao 18-19/09) chưa có phiếu hoặc phiếu không khớp được dòng PO.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-slips-recent.ts
 */
import { prisma } from "@hoanggia/db";

const d = (x: Date | null) => (x ? `${x.getDate()}/${x.getMonth() + 1}` : "?");
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  const slips = await prisma.shipmentSlip.findMany({
    where: { slipDate: { gte: new Date(2026, 8, 17) } },
    orderBy: [{ slipDate: "asc" }, { slipNumber: "asc" }],
    select: {
      slipNumber: true, slipDate: true, customerName: true, createdAt: true,
      items: { select: { poSaleNumber: true, itemCode: true, qtyActual: true } },
      generatedDeliveryEvents: { select: { value: true } },
    },
  });
  console.log(`Phiếu từ 17/09: ${slips.length}`);
  for (const s of slips) {
    const ev = s.generatedDeliveryEvents.reduce((a, e) => a + Number(e.value), 0);
    console.log(`  ${s.slipNumber} ngày ${d(s.slipDate)} (up ${s.createdAt.toISOString().slice(5, 16)}Z) ${s.items.length} dòng, đợt giao ${s.generatedDeliveryEvents.length} = ${money(ev)} | ${(s.customerName ?? "").slice(0, 24)}`);
  }
  const wanted = ["D09.26MQ18A", "D09.26PD09A", "D08.26MQ57A", "D09.26NT10A", "D08.26DT57A", "D09.26DT37A"];
  console.log("\nDòng phiếu thuộc các PO cần đối chiếu (mọi ngày):");
  const items = await prisma.shipmentSlipItem.findMany({
    where: { poSaleNumber: { in: wanted } },
    select: { poSaleNumber: true, itemCode: true, qtyActual: true, shipmentSlip: { select: { slipNumber: true, slipDate: true } } },
  });
  for (const i of items) console.log(`  ${i.poSaleNumber} ${i.itemCode} SL ${Number(i.qtyActual ?? 0)} — phiếu ${i.shipmentSlip.slipNumber} ngày ${d(i.shipmentSlip.slipDate)}`);
  if (items.length === 0) console.log("  (không có phiếu nào chứa các PO này)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
