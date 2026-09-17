/**
 * Sửa dữ liệu 1 lần: xoá các dòng PoTrackingLine TRÙNG do AMIS đồng bộ tạo thêm khi mã hàng đã
 * được sửa lại đúng trên file Excel PO tracking nhưng AMIS chưa cập nhật theo (xem
 * packages/db/src/po-tracking-from-orders.ts, phần "bước 3" — bug đã xác nhận bằng dữ liệu thật,
 * gây đếm 2 lần doanh số đã giao cho cùng 1 lô hàng thật).
 *
 * Nhận diện dòng CẦN XOÁ (dòng AMIS trùng) bằng field nvkdCodeRaw: dòng nhập từ Excel PO tracking
 * LUÔN có nvkdCodeRaw (vd "QUANDM"), dòng do syncPoTrackingFromOrders tự sinh từ AMIS LUÔN để
 * nvkdCodeRaw = null (xem po-tracking-from-orders.ts: data.nvkdCodeRaw luôn null). Chỉ xoá khi:
 *   - Cùng Số PO, cùng Tên hàng, cùng SL PO, cùng Giá HĐ, cùng Hạn giao (ngày) — đủ 5 điều kiện
 *     mới coi là "chắc chắn cùng 1 mặt hàng thật" (không suy đoán lỏng hơn, xem bài học từ lần
 *     đầu dùng điều kiện lỏng SL+Giá+Hạn giao khớp nhầm 933 cặp, đa số là 2 mặt hàng khác nhau
 *     tình cờ trùng SL/Giá).
 *   - Đúng 2 dòng khớp nhau, mã hàng khác nhau.
 *   - 1 dòng có nvkdCodeRaw (giữ lại — nguồn Excel, đáng tin theo anh Quân xác nhận), 1 dòng
 *     nvkdCodeRaw null (xoá — bản AMIS lỗi thời).
 *   - CẢ 2 dòng đều có deliveredValue > 0 (mới thật sự đang bị đếm 2 lần doanh số — nếu dòng AMIS
 *     chưa có gì giao thì xoá nó không đổi số liệu doanh số, nhưng vẫn xoá cho sạch dữ liệu).
 * Nhóm không khớp đủ các điều kiện trên (vd cả 2 cùng có/không có nvkdCodeRaw, hoặc khớp nhiều
 * hơn 2 dòng) bị BỎ QUA, in ra để anh tự rà soát tay — không suy đoán xoá nhầm.
 *
 * Cách chạy: npx tsx scripts/repair-duplicate-po-lines.ts [--dry-run]
 */
import { prisma } from "@hoanggia/db";

function dayKey(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "null";
}
function numKey(n: unknown): string {
  return n === null || n === undefined ? "null" : n.toString();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const lines = await prisma.poTrackingLine.findMany({
    select: {
      id: true,
      poCode: true,
      itemCode: true,
      itemName: true,
      poQuantity: true,
      contractPrice: true,
      requestedDeliveryDate: true,
      deliveredValue: true,
      nvkdCodeRaw: true,
    },
  });

  const byKey = new Map<string, typeof lines>();
  for (const l of lines) {
    const key = [l.poCode, l.itemName, numKey(l.poQuantity), numKey(l.contractPrice), dayKey(l.requestedDeliveryDate)].join("::");
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(l);
  }

  const toDelete: { id: string; poCode: string; itemCode: string | null; deliveredValue: string }[] = [];
  const skippedAmbiguous: string[] = [];

  for (const [key, group] of byKey) {
    const distinctItemCodes = new Set(group.map((g) => g.itemCode));
    if (group.length !== 2 || distinctItemCodes.size !== 2) continue;

    const [a, b] = group;
    const aHasNvkd = !!a.nvkdCodeRaw;
    const bHasNvkd = !!b.nvkdCodeRaw;
    if (aHasNvkd === bHasNvkd) {
      // cả 2 cùng có hoặc cùng không có nvkdCodeRaw — không phân biệt được dòng nào là Excel/AMIS.
      skippedAmbiguous.push(`${key} (2 dòng cùng ${aHasNvkd ? "CÓ" : "KHÔNG"} nvkdCodeRaw, không phân biệt được)`);
      continue;
    }
    const keep = aHasNvkd ? a : b;
    const drop = aHasNvkd ? b : a;
    if (Number(keep.deliveredValue) <= 0 || Number(drop.deliveredValue) <= 0) continue; // không đếm trùng thật, bỏ qua

    toDelete.push({ id: drop.id, poCode: drop.poCode, itemCode: drop.itemCode, deliveredValue: drop.deliveredValue.toString() });
  }

  console.log(`Tìm thấy ${toDelete.length} dòng AMIS trùng cần xoá (đang đếm trùng doanh số).`);
  for (const d of toDelete) console.log(`  - ${d.poCode} / ${d.itemCode} (id=${d.id}, deliveredValue=${d.deliveredValue})`);
  console.log(`\nBỏ qua ${skippedAmbiguous.length} nhóm không phân biệt được rõ ràng — anh tự rà soát:`);
  for (const s of skippedAmbiguous) console.log(`  - ${s}`);

  if (dryRun) {
    console.log("\n=== DRY RUN — chưa xoá gì ===");
    return;
  }

  for (const d of toDelete) {
    await prisma.poTrackingLine.delete({ where: { id: d.id } }); // cascade xoá cả PoDeliveryEvent của dòng này
  }
  console.log(`\n=== ĐÃ XOÁ ${toDelete.length} dòng trùng ===`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
