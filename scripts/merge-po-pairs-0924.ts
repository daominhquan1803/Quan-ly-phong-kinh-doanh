/**
 * Gộp 2 cặp dòng PO trùng còn lại (anh Quân yêu cầu 24/09/2026), mỗi cặp là CÙNG 1 mặt hàng bị tính 2 lần:
 *  - D08.26MQ35A: AA07086 (Excel, giao 24/8) + ST07086 (AMIS, giao 25/8 qua phiếu BH03328) — cùng 5.000 túi,
 *    PO chỉ 5.000 → giữ dòng Excel AA07086, xoá ST07086 (đợt giao phiếu của nó xoá theo, vì trước mốc nền).
 *  - D08.26MQ32A: AA01.00236 (giao 24/8) + AA01.0143 (giao 26/8) — cùng Standee SL 20 (đơn AMIS chỉ 1 dòng
 *    AA01.0143; phiếu BH03362 ghi giao 26/8) → giữ AA01.0143 (khớp AMIS + ngày phiếu), xoá AA01.00236.
 * Mặc định DRY-RUN; --apply để xoá thật. Sau đó chạy sync-po-from-orders.ts cho 2 PO để kiểm chứng.
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");
const TARGETS: [string, string][] = [
  ["D08.26MQ35A", "ST07086"],
  ["D08.26MQ32A", "AA01.00236"],
];

async function main() {
  console.log(apply ? "=== GHI THẬT ===" : "=== DRY-RUN ===");
  for (const [po, code] of TARGETS) {
    const lines = await prisma.poTrackingLine.findMany({
      where: { poCode: po, itemCode: code },
      select: { id: true, poValue: true, deliveredValue: true, deliveryEvents: { select: { id: true } } },
    });
    if (lines.length !== 1) {
      console.log(`${po}/${code}: tìm thấy ${lines.length} dòng — bỏ qua`);
      continue;
    }
    const l = lines[0];
    console.log(`${po}/${code}: PO ${Number(l.poValue)} giao ${Number(l.deliveredValue)} (${l.deliveryEvents.length} đợt) -> xoá`);
    if (apply) await prisma.poTrackingLine.delete({ where: { id: l.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
