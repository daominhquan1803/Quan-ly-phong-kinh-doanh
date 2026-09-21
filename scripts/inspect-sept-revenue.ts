/**
 * CHỈ ĐỌC — chẩn đoán doanh số "Thực hiện (đã giao)" tháng 9/2026 (trang Kế hoạch & Mục tiêu):
 * tách theo nguồn (file PO tracking Excel vs Phiếu đi hàng), theo ngày, và tìm dấu hiệu tính trùng.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-sept-revenue.ts [YYYY-MM]
 */
import { prisma } from "@hoanggia/db";

const ym = process.argv[2] ?? "2026-09";
const [Y, M] = ym.split("-").map(Number);
const start = new Date(Y, M - 1, 1);
const end = new Date(Y, M, 1);
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");
const day = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

async function main() {
  console.log(`TZ=${process.env.TZ} tháng ${ym}: ${start.toISOString()} → ${end.toISOString()}`);

  const batches = await prisma.poTrackingImportBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, fileName: true, createdAt: true, completedAt: true },
  });
  console.log("\n5 lần nhập file PO tracking gần nhất:");
  batches.forEach((b) => console.log(`  ${b.createdAt.toISOString()} ${b.fileName} completed=${b.completedAt?.toISOString() ?? "—"}`));

  const rawEvents = await prisma.poDeliveryEvent.findMany({
    where: { eventDate: { gte: start, lt: end }, salesEmployeeId: { not: null } },
    select: { id: true, value: true, quantity: true, eventDate: true, sourceShipmentSlipId: true, lineId: true, salesEmployeeId: true },
  });
  const events = rawEvents.map((e) => ({ ...e, salesEmployeeId: e.salesEmployeeId as string }));

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name]));

  let excel = 0, slip = 0;
  const byEmp = new Map<string, { excel: number; slip: number }>();
  const byDay = new Map<string, { excel: number; slip: number; slipCount: number }>();
  for (const e of events) {
    const v = Number(e.value);
    const isSlip = !!e.sourceShipmentSlipId;
    if (isSlip) slip += v; else excel += v;
    const emp = byEmp.get(e.salesEmployeeId) ?? { excel: 0, slip: 0 };
    if (isSlip) emp.slip += v; else emp.excel += v;
    byEmp.set(e.salesEmployeeId, emp);
    const k = day(e.eventDate);
    const d = byDay.get(k) ?? { excel: 0, slip: 0, slipCount: 0 };
    if (isSlip) { d.slip += v; d.slipCount++; } else d.excel += v;
    byDay.set(k, d);
  }
  console.log(`\nTổng đợt giao tháng ${ym}: ${events.length} — Excel ${money(excel)} + Phiếu ${money(slip)} = ${money(excel + slip)}`);
  console.log("Theo nhân viên:");
  for (const [id, v] of byEmp) console.log(`  ${nameOf.get(id)}: Excel ${money(v.excel)} | Phiếu ${money(v.slip)} | tổng ${money(v.excel + v.slip)}`);
  console.log("Theo ngày (giá trị Excel | Phiếu | số event phiếu):");
  [...byDay.entries()].sort((a, b) => a[0].split("/").reverse().join().localeCompare(b[0].split("/").reverse().join())).forEach(([k, v]) => console.log(`  ${k}: ${money(v.excel)} | ${money(v.slip)} | ${v.slipCount}`));

  // Đợt giao phiếu nằm TRƯỚC mốc nhập file PO tracking của chính dòng (đã bị nền hấp thụ → tính trùng)
  const slipEvents = events.filter((e) => e.sourceShipmentSlipId);
  const lines = await prisma.poTrackingLine.findMany({
    where: { id: { in: [...new Set(slipEvents.map((e) => e.lineId))] } },
    select: { id: true, importBatch: { select: { createdAt: true } } },
  });
  const cutoff = new Map(lines.map((l) => [l.id, l.importBatch?.createdAt ?? null]));
  const before = slipEvents.filter((e) => { const c = cutoff.get(e.lineId); return c && e.eventDate < c; });
  console.log(`\nĐợt giao Phiếu có ngày TRƯỚC mốc nhập PO tracking của dòng (nghi tính trùng với nền): ${before.length} — ${money(before.reduce((s, e) => s + Number(e.value), 0))}`);

  // Phiếu trùng nội dung nhưng khác số phiếu
  const slips = await prisma.shipmentSlip.findMany({
    where: { slipDate: { gte: start, lt: end } },
    select: { id: true, slipNumber: true, slipDate: true, customerName: true, createdAt: true, importBatchId: true, items: { select: { poSaleNumber: true, itemCode: true, qtyActual: true } } },
  });
  console.log(`\nSố Phiếu đi hàng trong tháng: ${slips.length}`);
  const sig = new Map<string, string[]>();
  for (const s of slips) {
    const key = `${s.slipDate?.toISOString().slice(0, 10)}|${(s.customerName ?? "").trim().toLowerCase()}|` +
      s.items.map((i) => `${i.poSaleNumber}/${i.itemCode}/${Number(i.qtyActual ?? 0)}`).sort().join(";");
    sig.set(key, [...(sig.get(key) ?? []), s.slipNumber]);
  }
  const dups = [...sig.entries()].filter(([, v]) => v.length > 1);
  console.log(`Nhóm phiếu TRÙNG nội dung nhưng khác số phiếu: ${dups.length}`);
  dups.slice(0, 15).forEach(([k, v]) => console.log(`  ${v.join(", ")}  ← ${k.slice(0, 90)}`));

  // Số phiếu theo ngày tạo (mỗi lần upload)
  const byCreated = new Map<string, number>();
  for (const s of slips) { const k = s.createdAt.toISOString().slice(0, 13); byCreated.set(k, (byCreated.get(k) ?? 0) + 1); }
  console.log("Phiếu theo giờ tạo (UTC):");
  [...byCreated.entries()].sort().forEach(([k, n]) => console.log(`  ${k}h: ${n}`));

  // Cùng 1 dòng PO có nhiều event phiếu cùng ngày cùng SL (khác phiếu)
  const evKey = new Map<string, number>();
  for (const e of slipEvents) {
    const k = `${e.lineId}|${e.eventDate.toISOString().slice(0, 10)}|${Number(e.quantity)}`;
    evKey.set(k, (evKey.get(k) ?? 0) + 1);
  }
  const dupEv = [...evKey.values()].filter((n) => n > 1);
  console.log(`\nCặp event phiếu cùng dòng PO + cùng ngày + cùng SL (nghi trùng): ${dupEv.length} nhóm, dư ${dupEv.reduce((s, n) => s + n - 1, 0)} event`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
