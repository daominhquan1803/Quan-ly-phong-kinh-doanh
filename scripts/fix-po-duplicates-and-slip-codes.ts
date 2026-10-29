/**
 * Sửa dữ liệu Tiến độ giao hàng 29/10/2026 (anh Quân duyệt):
 *  1) Xoá các dòng mã cũ đã tự đóng (không còn trong đơn AMIS, chưa giao gì) — còn nằm lại sẽ làm tổng G.Trị PO bị tính trùng.
 *  2) Gộp dòng PO bị tách đôi (đơn D05.26MQ78A: mỗi mã 2 dòng, đơn AMIS chỉ 1 dòng) — cộng phần đã giao vào dòng 1, dòng 2 xoá.
 *  3) Chuyển phần đã giao từ dòng mã cũ AA07062 sang dòng mã mới ST10034 (đơn D10.26NT21A), xoá dòng cũ.
 *  4) Sửa mã hàng trên phiếu đi hàng cho đúng mã trên PO, rồi khớp lại toàn bộ phiếu với PO.
 * Mặc định CHỈ in kế hoạch (dry-run); thêm --apply để ghi. Chạy trong container worker: npx tsx fix-po-duplicates-and-slip-codes.ts [--apply]
 */
import { prisma, recomputeLineDeliveryFields, resyncAllShipmentSlipDeliveries } from "@hoanggia/db";

const APPLY = process.argv.includes("--apply");
const log = (...a: unknown[]) => console.log(...a);

const MERGE_PO = "D05.26MQ78A";
const MOVE = { poCode: "D10.26NT21A", from: "AA07062", to: "ST10034" };
const SLIP_FIXES: { slip: string; from: string; to: string }[] = [
  { slip: "BH02897", from: "AA04027", to: "AA04004_ACT1" },
  { slip: "BH02897", from: "ST04.000206", to: "AA04.000206" },
  { slip: "BH02897", from: "ST071695", to: "ST071695_ACT1" },
  { slip: "BH04123", from: "AA04027", to: "AA04004_ACT1" },
  { slip: "BH04543", from: "ST010047", to: "AA071225" },
];

async function dropStale() {
  const lines = await prisma.poTrackingLine.findMany({
    where: {
      manuallyClosed: true,
      OR: [{ note: { contains: "Mã hàng không còn trong đơn AMIS" } }, { note: { contains: "Dòng mã cũ đã đổi trên AMIS" } }],
    },
    select: { id: true, poCode: true, itemCode: true, poValue: true, totalDeliveredQty: true, baselineDeliveredQty: true, _count: { select: { deliveryEvents: true } } },
  });
  const safe = lines.filter((l) => Number(l.totalDeliveredQty ?? 0) === 0 && Number(l.baselineDeliveredQty ?? 0) === 0 && l._count.deliveryEvents === 0);
  log(`[1] dòng mã cũ đã đóng: ${lines.length}, an toàn để xoá: ${safe.length}, tổng G.Trị PO ${Math.round(safe.reduce((s, l) => s + Number(l.poValue), 0) / 1e6)} triệu`);
  safe.forEach((l) => log(`    ${l.poCode} / ${l.itemCode}`));
  if (APPLY && safe.length) await prisma.poTrackingLine.deleteMany({ where: { id: { in: safe.map((l) => l.id) } } });
}

async function mergeLines(keeperId: string, dupId: string) {
  const [k, d] = await Promise.all([prisma.poTrackingLine.findUniqueOrThrow({ where: { id: keeperId } }), prisma.poTrackingLine.findUniqueOrThrow({ where: { id: dupId } })]);
  await prisma.$transaction([
    prisma.poDeliveryEvent.updateMany({ where: { lineId: dupId }, data: { lineId: keeperId } }),
    prisma.poTrackingLine.update({
      where: { id: keeperId },
      data: {
        baselineDeliveredQty: Number(k.baselineDeliveredQty ?? 0) + Number(d.baselineDeliveredQty ?? 0),
        baselineDeliveredValue: Number(k.baselineDeliveredValue) + Number(d.baselineDeliveredValue),
      },
    }),
    prisma.poTrackingLine.delete({ where: { id: dupId } }),
  ]);
  await recomputeLineDeliveryFields(keeperId);
}

async function mergeDuplicates() {
  const lines = await prisma.poTrackingLine.findMany({ where: { poCode: MERGE_PO }, orderBy: { naturalKey: "asc" } });
  const byCode = new Map<string, typeof lines>();
  for (const l of lines) (byCode.get(l.itemCode ?? "?") ?? byCode.set(l.itemCode ?? "?", []).get(l.itemCode ?? "?")!).push(l);
  for (const [code, ls] of byCode) {
    if (ls.length < 2) continue;
    const [keeper, ...dups] = ls;
    const delivered = ls.reduce((s, l) => s + Number(l.totalDeliveredQty ?? 0), 0);
    log(`[2] ${MERGE_PO} / ${code}: ${ls.length} dòng → 1, SL PO ${Number(keeper.poQuantity)}, tổng đã giao ${delivered}`);
    if (APPLY) for (const d of dups) await mergeLines(keeper.id, d.id);
  }
}

async function moveStaleDeliveries() {
  const [from, to] = await Promise.all([
    prisma.poTrackingLine.findFirst({ where: { poCode: MOVE.poCode, itemCode: MOVE.from } }),
    prisma.poTrackingLine.findFirst({ where: { poCode: MOVE.poCode, itemCode: MOVE.to } }),
  ]);
  if (!from || !to) return log(`[3] ${MOVE.poCode}: không thấy dòng ${from ? MOVE.to : MOVE.from} (có thể đã xử lý)`);
  log(`[3] ${MOVE.poCode}: chuyển đã giao ${Number(from.totalDeliveredQty ?? 0)} từ ${MOVE.from} sang ${MOVE.to}, xoá dòng ${MOVE.from}`);
  if (APPLY) await mergeLines(to.id, from.id);
}

async function fixSlipCodes() {
  for (const f of SLIP_FIXES) {
    const items = await prisma.shipmentSlipItem.findMany({ where: { itemCode: f.from, shipmentSlip: { slipNumber: f.slip } }, select: { id: true, qtyActual: true } });
    log(`[4] phiếu ${f.slip}: ${f.from} → ${f.to} (${items.length} dòng, SL ${items.map((i) => Number(i.qtyActual ?? 0)).join("/")})`);
    if (APPLY && items.length) await prisma.shipmentSlipItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { itemCode: f.to } });
  }
}

async function show(label: string) {
  const lines = await prisma.poTrackingLine.findMany({
    where: { poCode: { in: [MERGE_PO, "D09.26DT63A", "D10.26MQ30A", "D10.26NT21A"] } },
    orderBy: [{ poCode: "asc" }, { itemCode: "asc" }],
    select: { poCode: true, itemCode: true, poQuantity: true, totalDeliveredQty: true, remainingValue: true, statusRaw: true },
  });
  log(`--- ${label}`);
  lines.forEach((l) => log(`${l.poCode} ${l.itemCode} PO ${Number(l.poQuantity)} giao ${Number(l.totalDeliveredQty ?? 0)} còn ${Math.round(Number(l.remainingValue))} ${l.statusRaw}`));
}

async function main() {
  log(APPLY ? "== GHI DỮ LIỆU ==" : "== DRY-RUN (chưa ghi) ==");
  await show("TRƯỚC");
  await dropStale();
  await mergeDuplicates();
  await moveStaleDeliveries();
  await fixSlipCodes();
  if (APPLY) {
    const r = await resyncAllShipmentSlipDeliveries();
    log("[5] khớp lại phiếu:", JSON.stringify(r).slice(0, 300));
    await show("SAU");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
