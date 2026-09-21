/**
 * CHỈ ĐỌC — so sánh các cách tính "PO lên trong tháng" (giá trị PO đặt hàng theo ngày đặt PO) và
 * doanh số đã giao giữa các trang, để tìm chỗ lệch số.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/inspect-po-metrics.ts [YYYY-MM]
 */
import { prisma } from "@hoanggia/db";

const ym = process.argv[2] ?? "2026-09";
const [Y, M] = ym.split("-").map(Number);
const start = new Date(Y, M - 1, 1);
const end = new Date(Y, M, 1);
const money = (n: number) => Math.round(n).toLocaleString("vi-VN");

async function main() {
  console.log(`TZ=${process.env.TZ} tháng ${ym}`);
  const users = await prisma.user.findMany({
    select: { id: true, name: true, active: true, amisEmployeeCode: true, includeInSalesStats: true, role: true },
  });
  const u = new Map(users.map((x) => [x.id, x]));
  const inStats = (id: string | null) => {
    const x = id ? u.get(id) : null;
    return !!x && x.active && !!x.amisEmployeeCode && x.includeInSalesStats;
  };

  const lines = await prisma.poTrackingLine.findMany({
    where: { poDate: { gte: start, lt: end } },
    select: { id: true, poCode: true, itemCode: true, poValue: true, salesEmployeeId: true, naturalKey: true, importBatchId: true },
  });
  let all = 0, withEmp = 0, stats = 0, noEmp = 0;
  const byEmp = new Map<string, number>();
  for (const l of lines) {
    const v = Number(l.poValue);
    all += v;
    if (l.salesEmployeeId) {
      withEmp += v;
      byEmp.set(l.salesEmployeeId, (byEmp.get(l.salesEmployeeId) ?? 0) + v);
      if (inStats(l.salesEmployeeId)) stats += v;
    } else noEmp += v;
  }
  console.log(`\nDòng PO có ngày đặt trong tháng: ${lines.length}`);
  console.log(`  Tổng mọi dòng: ${money(all)} | có gán NVKD: ${money(withEmp)} | NVKD tính vào thống kê: ${money(stats)} | chưa gán NVKD: ${money(noEmp)}`);
  console.log("  Theo NVKD (đ, cờ thống kê):");
  for (const [id, v] of byEmp) {
    const x = u.get(id);
    console.log(`    ${x?.name ?? id}: ${money(v)} [active=${x?.active} amis=${x?.amisEmployeeCode ?? "—"} stats=${x?.includeInSalesStats} role=${x?.role}]`);
  }

  // Dòng trùng (cùng Số PO + Mã hàng xuất hiện > 1 dòng) trong tháng
  const key = new Map<string, { n: number; v: number }>();
  for (const l of lines) {
    const k = `${l.poCode}|${l.itemCode ?? ""}`;
    const cur = key.get(k) ?? { n: 0, v: 0 };
    cur.n++;
    cur.v += Number(l.poValue);
    key.set(k, cur);
  }
  const dups = [...key.entries()].filter(([, v]) => v.n > 1);
  console.log(`\nCặp Số PO + Mã hàng có >1 dòng: ${dups.length} nhóm (cộng giá trị các dòng: ${money(dups.reduce((s, [, v]) => s + v.v, 0))})`);
  dups.slice(0, 8).forEach(([k, v]) => console.log(`    ${k}: ${v.n} dòng, ${money(v.v)}`));

  // Nguồn dòng theo lần nhập
  const byBatch = new Map<string, number>();
  for (const l of lines) byBatch.set(l.importBatchId ?? "(không có batch)", (byBatch.get(l.importBatchId ?? "(không có batch)") ?? 0) + Number(l.poValue));
  console.log("Theo lần nhập (importBatchId):");
  for (const [b, v] of byBatch) console.log(`    ${b}: ${money(v)}`);

  // Trang Đơn hàng (bảng Order) cùng tháng theo ngày đặt
  const orders = await prisma.order.findMany({
    where: { orderDate: { gte: start, lt: end } },
    select: { totalValue: true, status: true, salesEmployeeId: true },
  });
  const orderAll = orders.reduce((s, o) => s + Number(o.totalValue), 0);
  const orderNoCancel = orders.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + Number(o.totalValue), 0);
  console.log(`\nBảng Đơn hàng (Order) ngày đặt trong tháng: ${orders.length} đơn, tổng ${money(orderAll)} (không tính huỷ ${money(orderNoCancel)})`);

  // Doanh số đã giao tháng
  const ev = await prisma.poDeliveryEvent.groupBy({
    by: ["salesEmployeeId"],
    where: { eventDate: { gte: start, lt: end }, salesEmployeeId: { not: null } },
    _sum: { value: true },
  });
  const evAll = ev.reduce((s, r) => s + Number(r._sum.value ?? 0), 0);
  const evStats = ev.filter((r) => inStats(r.salesEmployeeId)).reduce((s, r) => s + Number(r._sum.value ?? 0), 0);
  console.log(`\nĐã giao tháng (PoDeliveryEvent): mọi NVKD ${money(evAll)} | NVKD thống kê ${money(evStats)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
