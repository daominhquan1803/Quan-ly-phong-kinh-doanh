/**
 * CHI DOC - kiem tra co the tinh nguoc OIH ve cuoi ngay X tu PoDeliveryEvent khong.
 * So sanh deliveredValue cua dong PO voi tong PoDeliveryEvent.value; dem dong dong (Ket thuc) ma chua giao du.
 * Chay: npx tsx scripts/inspect-oih-history.ts
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const lines = await prisma.poTrackingLine.findMany({
    where: { salesEmployeeId: { not: null } },
    select: { poValue: true, poDate: true, deliveredValue: true, remainingValue: true, statusRaw: true, baselineDeliveredValue: true, deliveryEvents: { select: { value: true, eventDate: true } } },
  });
  let n = 0, eqEvents = 0, noPoDate = 0, closedUnfinished = 0, closedUnfinishedVal = 0, baselineGap = 0, baselineGapVal = 0;
  for (const l of lines) {
    n++;
    const ev = l.deliveryEvents.reduce((s, e) => s + Number(e.value), 0);
    if (Math.abs(ev - Number(l.deliveredValue)) < 1) eqEvents++;
    else { baselineGap++; baselineGapVal += Number(l.deliveredValue) - ev; }
    if (!l.poDate) noPoDate++;
    if ((l.statusRaw ?? "").trim().toLowerCase() === "kết thúc" && Number(l.deliveredValue) + 1 < Number(l.poValue)) {
      closedUnfinished++; closedUnfinishedVal += Number(l.poValue) - Number(l.deliveredValue);
    }
  }
  console.log({ n, eqEvents, baselineGap, baselineGapVal, noPoDate, closedUnfinished, closedUnfinishedVal });
}
main().finally(() => prisma.$disconnect());
