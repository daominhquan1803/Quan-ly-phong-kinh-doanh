/**
 * Sửa dữ liệu: ngày giao (PoDeliveryEvent.eventDate, nguồn file PO tracking Excel), ngày PO và ngày
 * yêu cầu giao của PoTrackingLine bị LÙI 1 NGÀY do thư viện xlsx (cellDates:true) đổi serial nguyên ngày
 * thành 23:59:30 hôm trước khi chạy ở múi giờ Việt Nam (xem excelCellToDate trong
 * packages/db/src/po-tracking-import.ts) — phát hiện 21/09/2026 khi đối chiếu với file PO tracking 19/09.
 *
 * Nhận diện chính xác: giờ UTC = 16:59:xx (23:59:xx giờ VN). Sửa = đặt lại đúng 17:00:00.000 UTC cùng ngày
 * UTC (= 00:00 giờ VN NGÀY SAU). Đợt giao sinh từ Phiếu đi hàng (sourceShipmentSlipId khác null) không đụng.
 *
 * Mặc định DRY-RUN (chỉ in ra). Thêm --apply để ghi thật.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/repair-excel-date-shift.ts [--apply]
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");
const isBuggy = (d: Date) => d.getUTCHours() === 16 && d.getUTCMinutes() === 59;
const fixed = (d: Date) => {
  const t = new Date(d);
  t.setUTCHours(17, 0, 0, 0);
  return t;
};
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  console.log(apply ? "=== GHI THẬT ===" : "=== DRY-RUN (chỉ in ra) ===");

  // Phân bố giờ UTC của đợt giao nguồn Excel để chắc chắn nhận diện đúng
  const events = await prisma.poDeliveryEvent.findMany({
    where: { sourceShipmentSlipId: null },
    select: { id: true, eventDate: true, value: true },
  });
  const sig = new Map<string, number>();
  for (const e of events) {
    const k = e.eventDate.toISOString().slice(11, 16);
    sig.set(k, (sig.get(k) ?? 0) + 1);
  }
  console.log(`Đợt giao nguồn Excel: ${events.length}. Phân bố giờ:phút UTC:`, JSON.stringify([...sig].sort((a, b) => b[1] - a[1]).slice(0, 6)));

  const buggy = events.filter((e) => isBuggy(e.eventDate));
  const moves = new Map<string, { n: number; v: number }>();
  for (const e of buggy) {
    const k = `${ym(e.eventDate)} -> ${ym(fixed(e.eventDate))}`;
    const cur = moves.get(k) ?? { n: 0, v: 0 };
    cur.n++;
    cur.v += Number(e.value);
    moves.set(k, cur);
  }
  console.log(`Đợt giao lệch 1 ngày (16:59 UTC): ${buggy.length}. Đổi tháng sau khi sửa:`);
  for (const [k, v] of [...moves].filter(([k]) => k.split(" -> ")[0] !== k.split(" -> ")[1])) console.log(`  ${k}: ${v.n} đợt, ${money(v.v)}đ`);

  const lines = await prisma.poTrackingLine.findMany({
    select: { id: true, poDate: true, requestedDeliveryDate: true },
  });
  const badPo = lines.filter((l) => l.poDate && isBuggy(l.poDate));
  const badReq = lines.filter((l) => l.requestedDeliveryDate && isBuggy(l.requestedDeliveryDate));
  console.log(`Dòng PO: ${lines.length}; poDate lệch: ${badPo.length}; requestedDeliveryDate lệch: ${badReq.length}`);

  if (!apply) return;
  for (const e of buggy) await prisma.poDeliveryEvent.update({ where: { id: e.id }, data: { eventDate: fixed(e.eventDate) } });
  for (const l of badPo) await prisma.poTrackingLine.update({ where: { id: l.id }, data: { poDate: fixed(l.poDate as Date) } });
  for (const l of badReq) await prisma.poTrackingLine.update({ where: { id: l.id }, data: { requestedDeliveryDate: fixed(l.requestedDeliveryDate as Date) } });
  console.log(`Đã sửa ${buggy.length} đợt giao, ${badPo.length} ngày PO, ${badReq.length} ngày yêu cầu giao.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
