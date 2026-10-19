/**
 * Đánh dấu hàng mẫu cho dữ liệu đơn AMIS ĐÃ có sẵn (đồng bộ AMIS chỉ lấy đơn mới sửa nên không tự cập nhật đơn cũ):
 * đọc rawData của từng đơn AMIS -> OrderItem.isSample + trừ giá trị mẫu khỏi Order.totalValue -> chạy lại
 * syncPoTrackingFromOrders (gán PoTrackingLine.isSample, đưa giá trị mẫu về 0). An toàn chạy lặp lại.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/backfill-sample-lines.ts [--apply]   (không có --apply = chỉ thống kê)
 */
import { prisma, isSampleMapping, isSampleOrder, syncPoTrackingFromOrders, zeroSampleLineValues } from "@hoanggia/db";

interface Mapping { total?: number | null; amount?: number | null; price?: number | null; description?: string | null; custom_field3?: string | null; custom_field4?: string | null; custom_field6?: string | null; custom_field7?: string | null }
interface Raw { sale_order_name?: string | null; custom_field4?: string | null; sale_order_amount?: number | null; total_summary?: number | null; sale_order_product_mappings?: Mapping[] | null }

async function main() {
  const apply = process.argv.includes("--apply");
  const orders = await prisma.order.findMany({ where: { source: "AMIS_API", rawData: { not: undefined } }, select: { id: true, orderCode: true, totalValue: true, rawData: true } });
  let sampleLines = 0;
  let sampleOrders = 0;
  let valueRemoved = 0;
  let touchedOrders = 0;

  for (const o of orders) {
    const raw = o.rawData as unknown as Raw | null;
    const maps = raw?.sale_order_product_mappings ?? [];
    if (!raw || maps.length === 0) continue;
    const whole = isSampleOrder(raw);
    const flags = maps.map((m) => whole || isSampleMapping(m));
    const n = flags.filter(Boolean).length;
    if (n === 0) continue;
    touchedOrders++;
    sampleLines += n;
    if (whole) sampleOrders++;
    const total = raw.sale_order_amount ?? raw.total_summary ?? 0;
    const sampleTotal = maps.reduce((s, m, i) => s + (flags[i] ? m.total ?? (m.amount ?? 0) * (m.price ?? 0) : 0), 0);
    const newTotal = whole ? 0 : Math.max(0, total - sampleTotal);
    valueRemoved += Number(o.totalValue) - newTotal;
    if (!apply) continue;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) await prisma.orderItem.updateMany({ where: { orderId: o.id, lineOrder: i }, data: { isSample: true } });
    }
    await prisma.order.update({ where: { id: o.id }, data: { totalValue: newTotal } });
  }
  console.log(`Đơn có hàng mẫu: ${touchedOrders} (đơn mẫu cả đơn: ${sampleOrders}); dòng mẫu: ${sampleLines}; giá trị đơn bị trừ: ${Math.round(valueRemoved).toLocaleString("vi-VN")}`);
  if (!apply) {
    console.log("Chỉ thống kê — thêm --apply để ghi.");
    return;
  }
  const r = await syncPoTrackingFromOrders();
  const zeroed = await zeroSampleLineValues();
  const lines = await prisma.poTrackingLine.count({ where: { isSample: true } });
  console.log(`Đồng bộ lại dòng PO: tạo ${r.linesCreated}, cập nhật ${r.linesUpdated}, gộp ${r.linesMigrated}; dòng PO mẫu: ${lines}; dòng đưa về 0 thêm: ${zeroed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
