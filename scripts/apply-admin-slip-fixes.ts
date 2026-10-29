/**
 * Áp file "phiếu chưa khớp PO" Admin đã điền (29/10/2026, anh Quân duyệt): gán Số PO + sửa mã hàng trên dòng phiếu đi hàng
 * cho đúng PO/mã trên đơn, rồi khớp lại toàn bộ phiếu với tiến độ PO.
 * Mặc định CHỈ in kế hoạch (dry-run); thêm --apply để ghi. Chạy trong container worker: npx tsx apply-admin-slip-fixes.ts [--apply]
 */
import { prisma, resyncAllShipmentSlipDeliveries } from "@hoanggia/db";

const APPLY = process.argv.includes("--apply");

// stt = số thứ tự trong file; `code: null` = dòng phiếu hiện chưa có mã hàng.
const FIXES: { stt: number; slip: string; code: string | null; qty: number; po: string; newCode: string }[] = [
  { stt: 1, slip: "BH04479", code: "AA20117", qty: 1900, po: "D10.26MQ17A", newCode: "ST07503" },
  { stt: 3, slip: "BH04124", code: "AA04.000216", qty: 30, po: "D10.26NT02A", newCode: "AA04.000216" },
  { stt: 4, slip: "BH04322", code: "ST01028", qty: 11, po: "D07.26NT17A", newCode: "ST01028" },
  { stt: 6, slip: "BH04140", code: "AA04027", qty: 150000, po: "D08.26DT50A", newCode: "AA04004_ACT1" },
  { stt: 11, slip: "BH03670", code: "AA08.00020", qty: 7000, po: "D08.26NT38A", newCode: "AA08.00020" },
  { stt: 12, slip: "BH03981", code: "AA08011", qty: 5, po: "D09.26DT60A", newCode: "AA08011" },
  { stt: 13, slip: "BH04003", code: "AA07115", qty: 1520, po: "D08.26DT21A", newCode: "AA07115" },
  { stt: 14, slip: "BH04005", code: "AA071473", qty: 323, po: "D09.26DT67A", newCode: "AA071473" },
  { stt: 15, slip: "BH03760", code: "ST03736", qty: 60, po: "D07.26DT23A", newCode: "AA03736" },
  { stt: 16, slip: "BH03760", code: "ST09549", qty: 50, po: "D07.26DT23A", newCode: "AA07.000085" },
  { stt: 17, slip: "BH03760", code: "ST09559", qty: 12, po: "D09.26DT65A", newCode: "ST09559" },
  { stt: 18, slip: "BH03896", code: "ST09559", qty: 200, po: "D09.26DT65A", newCode: "ST09559" },
  { stt: 30, slip: "BH03805", code: "AA041020", qty: 300, po: "D09.26DT18A", newCode: "AA041020" },
  { stt: 32, slip: "BH03616", code: "ST071279", qty: 7500, po: "D09.26DT18A", newCode: "ST10014" },
  { stt: 33, slip: "BH03686", code: "ST071279", qty: 7500, po: "D09.26DT25A", newCode: "ST10014" },
  { stt: 34, slip: "BH03723", code: "AA09041", qty: 1, po: "D08.26DT51A", newCode: "AA09041" },
  { stt: 36, slip: "BH03528", code: null, qty: 15000, po: "D08.26MQ53A", newCode: "AA03.000163" },
];

async function main() {
  const plan: { id: string; po: string; newCode: string }[] = [];
  for (const f of FIXES) {
    const items = await prisma.shipmentSlipItem.findMany({
      where: { shipmentSlip: { slipNumber: f.slip }, itemCode: f.code, qtyActual: f.qty },
      select: { id: true, itemName: true, poSaleNumber: true },
    });
    const lines = await prisma.poTrackingLine.findMany({ where: { poCode: f.po, itemCode: f.newCode }, select: { poQuantity: true, totalDeliveredQty: true } });
    const ok = items.length === 1 && lines.length >= 1;
    console.log(
      `${ok ? "OK " : "BỎ"} #${f.stt} ${f.slip} ${f.code ?? "(không mã)"} x${f.qty} → ${f.po} / ${f.newCode} | dòng phiếu khớp: ${items.length}, dòng PO: ${lines.length}` +
        (lines[0] ? ` (PO ${lines[0].poQuantity}, đã giao ${lines[0].totalDeliveredQty})` : "")
    );
    if (ok) plan.push({ id: items[0].id, po: f.po, newCode: f.newCode });
  }
  console.log(`Sẽ sửa ${plan.length}/${FIXES.length} dòng phiếu.`);
  if (!APPLY) return;
  for (const p of plan) await prisma.shipmentSlipItem.update({ where: { id: p.id }, data: { poSaleNumber: p.po, itemCode: p.newCode } });
  const r = await resyncAllShipmentSlipDeliveries();
  console.log(`Đã sửa ${plan.length} dòng. Khớp lại: ${r.totalSlips} phiếu, khớp ${r.totalMatched}, còn chưa khớp ${r.totalUnmatchedItems} dòng.`);
}

main().finally(() => prisma.$disconnect());
