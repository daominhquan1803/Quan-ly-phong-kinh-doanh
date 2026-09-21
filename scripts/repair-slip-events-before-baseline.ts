/**
 * Sửa dữ liệu: xoá các đợt giao sinh từ Phiếu đi hàng (PoDeliveryEvent.sourceShipmentSlipId khác null)
 * có ngày TRƯỚC mốc nhập file PO tracking gần nhất của CHÍNH dòng PO đó (PoTrackingLine.importBatch
 * .createdAt) — "nền" của dòng đã bao gồm các đợt giao đó rồi, để lại là tính trùng doanh số
 * (trang Kế hoạch & Mục tiêu cộng thẳng mọi PoDeliveryEvent theo tháng). Tái diễn 21/09/2026: sau khi
 * bấm "Đồng bộ lại giao hàng"/upload lại phiếu cũ, ~3,49 tỷ đợt giao phiếu cũ được ghi lại.
 *
 * applyShipmentSlipDeliveries đã được sửa để không ghi lại các đợt này nữa — script chỉ dọn phần
 * đã lỡ ghi. Mặc định DRY-RUN (chỉ in ra); thêm --apply để xoá thật + tính lại các dòng PO bị ảnh hưởng.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/repair-slip-events-before-baseline.ts [--apply]
 */
import { prisma, recomputeLineDeliveryFields } from "@hoanggia/db";

const apply = process.argv.includes("--apply");
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  console.log(apply ? "=== GHI THẬT ===" : "=== DRY-RUN (chỉ in ra) ===");
  const lines = await prisma.poTrackingLine.findMany({
    where: { importBatchId: { not: null } },
    select: { id: true, importBatch: { select: { createdAt: true } } },
  });
  const cutoffByLine = new Map(lines.map((l) => [l.id, l.importBatch!.createdAt]));

  const slipEvents = await prisma.poDeliveryEvent.findMany({
    where: { sourceShipmentSlipId: { not: null }, lineId: { in: [...cutoffByLine.keys()] } },
    select: { id: true, lineId: true, value: true, eventDate: true },
  });
  const redundant = slipEvents.filter((e) => e.eventDate < (cutoffByLine.get(e.lineId) as Date));

  const byMonth = new Map<string, { n: number; value: number }>();
  for (const e of redundant) {
    const k = `${e.eventDate.getFullYear()}-${String(e.eventDate.getMonth() + 1).padStart(2, "0")}`;
    const cur = byMonth.get(k) ?? { n: 0, value: 0 };
    cur.n++;
    cur.value += Number(e.value);
    byMonth.set(k, cur);
  }
  console.log(`Đợt giao phiếu tổng: ${slipEvents.length}; nằm trước mốc nhập PO tracking của dòng (tính trùng): ${redundant.length}`);
  [...byMonth.entries()].sort().forEach(([k, v]) => console.log(`  tháng ${k}: ${v.n} đợt, ${money(v.value)}đ`));

  if (!apply) return;
  const ids = redundant.map((e) => e.id);
  for (let i = 0; i < ids.length; i += 500) {
    await prisma.poDeliveryEvent.deleteMany({ where: { id: { in: ids.slice(i, i + 500) } } });
  }
  const affected = [...new Set(redundant.map((e) => e.lineId))];
  for (const lineId of affected) await recomputeLineDeliveryFields(lineId);
  console.log(`Đã xoá ${ids.length} đợt giao, tính lại ${affected.length} dòng PO.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
