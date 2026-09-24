/**
 * Dọn dòng PO TRÙNG do đồng bộ AMIS tạo thêm (cùng 1 mặt hàng, mã hàng khác — Excel ghi "ST07800", AMIS còn ghi
 * "AA07800"; ví dụ PO D05.26NT27A): dòng AMIS chưa giao gì nên hiện "chưa giao 165 triệu" dù dòng Excel đã giao
 * gần đủ. Bản cũ (repair-duplicate-po-lines.ts) BỎ QUA nhóm mà 1 dòng có deliveredValue = 0 — nhưng chính dòng
 * AMIS chưa giao đó làm sai "chưa giao"/OIH/quá hạn, nên bản này xử lý luôn.
 *
 * Nhận diện (giống bản cũ, KHÔNG suy đoán lỏng): cùng Số PO + Tên hàng + SL PO + Giá HĐ + Hạn giao (ngày VN),
 * đúng 2 dòng, mã hàng khác nhau; 1 dòng có nvkdCodeRaw (Excel — giữ), 1 dòng nvkdCodeRaw = null (AMIS — xoá).
 * Bỏ qua (chỉ in ra để rà tay) nếu dòng AMIS đã có đợt giao/Phiếu đi hàng gắn vào (xoá sẽ mất lịch sử).
 *
 * Mặc định DRY-RUN. Thêm --apply để xoá thật (PoDeliveryEvent của dòng bị xoá tự xoá theo — chỉ xét dòng AMIS
 * chưa có đợt giao nào).
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/repair-duplicate-po-lines-v2.ts [--apply]
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");
const day = (d: Date | null) => (d ? `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` : "null");
const num = (n: unknown) => (n == null ? "null" : String(Number(n)));
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  console.log(apply ? "=== GHI THẬT ===" : "=== DRY-RUN (chỉ in ra) ===");
  const lines = await prisma.poTrackingLine.findMany({
    select: {
      id: true, poCode: true, itemCode: true, itemName: true, poQuantity: true, contractPrice: true,
      requestedDeliveryDate: true, deliveredValue: true, remainingValue: true, poValue: true, nvkdCodeRaw: true,
      salesEmployee: { select: { name: true } },
      _count: { select: { deliveryEvents: true } },
    },
  });

  const groups = new Map<string, typeof lines>();
  for (const l of lines) {
    if (!l.itemName) continue;
    const key = [l.poCode, l.itemName, num(l.poQuantity), num(l.contractPrice), day(l.requestedDeliveryDate)].join("::");
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }

  const del: (typeof lines)[number][] = [];
  const skipped: string[] = [];
  for (const [key, g] of groups) {
    if (g.length !== 2 || new Set(g.map((x) => x.itemCode)).size !== 2) continue;
    const excel = g.filter((x) => !!x.nvkdCodeRaw);
    const amis = g.filter((x) => !x.nvkdCodeRaw);
    if (excel.length !== 1 || amis.length !== 1) continue; // không phân biệt được nguồn
    if (amis[0]._count.deliveryEvents > 0 || Number(amis[0].deliveredValue) > 0) {
      skipped.push(`${key.split("::")[0]} ${amis[0].itemCode} (dòng AMIS đã có đợt giao ${money(Number(amis[0].deliveredValue))} — rà tay)`);
      continue;
    }
    del.push(amis[0]);
  }

  console.log(`Dòng AMIS trùng chưa giao gì, cần xoá: ${del.length}; tổng "còn phải giao" đang bị tính dư: ${money(del.reduce((s, l) => s + Number(l.remainingValue), 0))}đ`);
  for (const l of del.slice(0, 60)) {
    console.log(`  - ${l.poCode} / ${l.itemCode} | ${(l.itemName ?? "").slice(0, 28)} | ${l.salesEmployee?.name ?? "—"} | PO ${money(Number(l.poValue))} | còn ${money(Number(l.remainingValue))}`);
  }
  console.log(`Bỏ qua (rà tay): ${skipped.length}`);
  skipped.slice(0, 20).forEach((s) => console.log("  - " + s));

  if (!apply) return;
  const ids = del.map((l) => l.id);
  for (let i = 0; i < ids.length; i += 200) await prisma.poTrackingLine.deleteMany({ where: { id: { in: ids.slice(i, i + 200) } } });
  console.log(`Đã xoá ${ids.length} dòng AMIS trùng.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
