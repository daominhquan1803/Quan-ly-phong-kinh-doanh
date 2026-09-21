/**
 * CHỈ ĐỌC — in ra từng dòng PO có ngày đặt trong tháng và từng đợt giao trong tháng (dạng "L|..." và
 * "E|...") để đối chiếu từng dòng với file PO tracking Excel của anh Quân.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/dump-sept-po.ts [YYYY-MM]
 */
import { prisma } from "@hoanggia/db";

const ym = process.argv[2] ?? "2026-09";
const [Y, M] = ym.split("-").map(Number);
const start = new Date(Y, M - 1, 1);
const end = new Date(Y, M, 1);
const d = (x: Date | null) => (x ? `${x.getDate()}/${x.getMonth() + 1}/${x.getFullYear()}` : "");

async function main() {
  const lines = await prisma.poTrackingLine.findMany({
    where: { poDate: { gte: start, lt: end } },
    select: {
      id: true, nvkdCodeRaw: true, salesEmployeeId: true, poCode: true, itemCode: true, itemName: true,
      poDate: true, poValue: true, importBatchId: true, naturalKey: true, createdAt: true,
    },
  });
  for (const l of lines) {
    console.log(["L", l.nvkdCodeRaw ?? "", l.salesEmployeeId ? "emp" : "noemp", l.poCode, l.itemCode ?? "", d(l.poDate), Math.round(Number(l.poValue)), l.importBatchId ? "excel" : "amis", l.createdAt.toISOString().slice(0, 10), (l.itemName ?? "").slice(0, 30)].join("|"));
  }
  const events = await prisma.poDeliveryEvent.findMany({
    where: { eventDate: { gte: start, lt: end } },
    select: { eventDate: true, value: true, sourceShipmentSlipId: true, line: { select: { nvkdCodeRaw: true, poCode: true, itemCode: true } } },
  });
  for (const e of events) {
    console.log(["E", e.line.nvkdCodeRaw ?? "", e.line.poCode, e.line.itemCode ?? "", d(e.eventDate), Math.round(Number(e.value)), e.sourceShipmentSlipId ? "slip" : "excel"].join("|"));
  }
  console.log(`DONE lines=${lines.length} events=${events.length}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
