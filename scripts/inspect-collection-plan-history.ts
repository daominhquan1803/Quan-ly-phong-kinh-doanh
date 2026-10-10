/**
 * CHI DOC - nhin lai ke hoach thu tuan/thang vs thuc te cac thang gan day, de tu van cach dat ke hoach.
 * In: (A) ke hoach vs da thu tung tuan theo nhan vien (cung cach tinh /api/debt/summary);
 * (B) tien ve trong thang co dung tuan ke hoach khong; (C) khach tra som/tre so voi han;
 * (D) hoa don con no: ngay du kien lech han bao nhieu, da truot bao nhieu; (E) chi tieu doanh so vs thuc hien.
 * Chay: npx tsx scripts/inspect-collection-plan-history.ts [so thang nhin lai, mac dinh 3]
 */
import { prisma } from "@hoanggia/db";

const DAY = 86400000;
const M = (n: number) => (n / 1e6).toFixed(0).padStart(7); // trieu dong
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(0)}%` : "—").padStart(5);

function mondayOf(d: Date) {
  const day = d.getDay();
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (day === 0 ? -6 : 1 - day));
  return m;
}
function weekBuckets(year: number, month: number) {
  const ms = new Date(year, month - 1, 1);
  const me = new Date(year, month, 0);
  const out: { i: number; start: Date; end: Date }[] = [];
  let cur = mondayOf(ms);
  let i = 1;
  while (cur <= me && i <= 5) {
    const rawEnd = new Date(cur.getTime() + 6 * DAY);
    out.push({ i, start: cur < ms ? ms : cur, end: rawEnd > me ? me : rawEnd });
    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);
    i++;
  }
  return out;
}

async function main() {
  const back = Number(process.argv[2]) || 3;
  const now = new Date();
  const users = await prisma.user.findMany({ where: { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true }, select: { id: true, name: true } });
  const name = (id: string | null) => users.find((u) => u.id === id)?.name ?? "(khac/chua gan)";

  const invoices = await prisma.debtInvoice.findMany({
    select: {
      id: true, originalAmount: true, paidAmount: true, dueDate: true, invoiceDate: true, expectedPaymentDate: true, salesEmployeeId: true, updatedAt: true,
      allocations: { select: { amount: true, payment: { select: { paymentDate: true } } } },
    },
  });

  for (let k = back - 1; k >= 0; k--) {
    const base = new Date(now.getFullYear(), now.getMonth() - k, 1);
    const y = base.getFullYear();
    const mo = base.getMonth() + 1;
    const wk = weekBuckets(y, mo);
    const idx = (d: Date | null) => (d ? wk.findIndex((w) => d >= w.start && d <= w.end) : -1);
    console.log(`\n===== THANG ${mo}/${y} =====  (trieu dong; KH = tong so tien HD co ngay du kien trong tuan, theo ngay du kien HIEN TAI)`);
    const emp = new Map<string, { p: number[]; c: number[]; hit: number; otherWeek: number; unplanned: number }>();
    const row = (id: string | null) => {
      const key = name(id);
      let r = emp.get(key);
      if (!r) emp.set(key, (r = { p: wk.map(() => 0), c: wk.map(() => 0), hit: 0, otherWeek: 0, unplanned: 0 }));
      return r;
    };
    for (const inv of invoices) {
      const r = row(inv.salesEmployeeId);
      const pi = idx(inv.expectedPaymentDate);
      if (pi >= 0) r.p[pi] += Number(inv.originalAmount);
      for (const a of inv.allocations) {
        const ci = idx(a.payment.paymentDate);
        if (ci < 0) continue;
        const amt = Number(a.amount);
        r.c[ci] += amt;
        if (pi === ci) r.hit += amt;
        else if (pi >= 0) r.otherWeek += amt;
        else r.unplanned += amt;
      }
    }
    console.log("tuan:        " + wk.map((w) => `T${w.i}(${w.start.getDate()}-${w.end.getDate()})`.padStart(22)).join(""));
    const tot = { p: wk.map(() => 0), c: wk.map(() => 0), hit: 0, otherWeek: 0, unplanned: 0 };
    for (const [n, r] of [...emp.entries()].sort()) {
      const P = r.p.reduce((s, v) => s + v, 0);
      const C = r.c.reduce((s, v) => s + v, 0);
      if (P === 0 && C === 0) continue;
      console.log(n.padEnd(16).slice(0, 16) + wk.map((_, i) => `${M(r.c[i])}/${M(r.p[i])} ${pct(r.c[i], r.p[i])}`).join(" |") + `  || thang ${M(C)}/${M(P)} ${pct(C, P)}`);
      console.log(`   tien ve: dung tuan KH ${M(r.hit)} | KH tuan khac trong thang ${M(r.otherWeek)} | ngoai KH thang ${M(r.unplanned)}`);
      wk.forEach((_, i) => { tot.p[i] += r.p[i]; tot.c[i] += r.c[i]; });
      tot.hit += r.hit; tot.otherWeek += r.otherWeek; tot.unplanned += r.unplanned;
    }
    const P = tot.p.reduce((s, v) => s + v, 0);
    const C = tot.c.reduce((s, v) => s + v, 0);
    console.log("TONG".padEnd(16) + wk.map((_, i) => `${M(tot.c[i])}/${M(tot.p[i])} ${pct(tot.c[i], tot.p[i])}`).join(" |") + `  || thang ${M(C)}/${M(P)} ${pct(C, P)}`);
    console.log(`   tien ve: dung tuan KH ${M(tot.hit)} | KH tuan khac ${M(tot.otherWeek)} | ngoai KH thang ${M(tot.unplanned)} | ti trong KH tuan cuoi ${pct(tot.p[wk.length - 1], P)}`);

    // (E) chi tieu doanh so vs thuc hien
    const ms = new Date(y, mo - 1, 1);
    const me = new Date(y, mo, 1);
    const [targets, delivered] = await Promise.all([
      prisma.salesTarget.findMany({ where: { year: y, month: mo } }),
      prisma.poDeliveryEvent.groupBy({ by: ["salesEmployeeId"], where: { eventDate: { gte: ms, lt: me }, salesEmployeeId: { not: null } }, _sum: { value: true } }),
    ]);
    console.log("   doanh so di hang/chi tieu: " + users.map((u) => {
      const t = Number(targets.find((x) => x.employeeId === u.id)?.targetRevenue ?? 0);
      const a = Number(delivered.find((x) => x.salesEmployeeId === u.id)?._sum.value ?? 0);
      return `${u.name.split(" ").pop()} ${M(a).trim()}/${M(t).trim()} ${pct(a, t).trim()}`;
    }).join(" ; "));
  }

  // (C) khach tra so voi han: hoa don da thu het, lan tien ve cuoi trong `back` thang gan day
  const since = new Date(now.getFullYear(), now.getMonth() - (back - 1), 1);
  console.log(`\n===== (C) HOA DON DA THU HET tu ${since.toLocaleDateString("vi-VN")}: ngay tien ve cuoi so voi HAN / so voi NGAY DU KIEN =====`);
  const lateBy = new Map<string, { n: number; onTime: number; amt: number; lateAmt: number; days: number[] }>();
  for (const inv of invoices) {
    if (Number(inv.paidAmount) + 0.5 < Number(inv.originalAmount) || !inv.dueDate) continue;
    const dates = inv.allocations.map((a) => a.payment.paymentDate).filter((d): d is Date => !!d);
    if (dates.length === 0) continue;
    const last = new Date(Math.max(...dates.map((d) => d.getTime())));
    if (last < since) continue;
    const late = Math.round((last.getTime() - inv.dueDate.getTime()) / DAY);
    const key = name(inv.salesEmployeeId);
    const r = lateBy.get(key) ?? { n: 0, onTime: 0, amt: 0, lateAmt: 0, days: [] };
    r.n++; r.amt += Number(inv.originalAmount); r.days.push(late);
    if (late <= 0) r.onTime++; else r.lateAmt += Number(inv.originalAmount);
    lateBy.set(key, r);
  }
  for (const [n, r] of [...lateBy.entries()].sort()) {
    const s = [...r.days].sort((a, b) => a - b);
    console.log(`${n.padEnd(16).slice(0, 16)} ${String(r.n).padStart(4)} HD | dung/truoc han ${pct(r.onTime, r.n)} so HD | tien tre han ${M(r.lateAmt)}/${M(r.amt)} | tre trung vi ${s[Math.floor(s.length / 2)]} ngay, P80 ${s[Math.floor(s.length * 0.8)]} ngay`);
  }

  // (D) hoa don con no hien tai
  console.log(`\n===== (D) HOA DON CON NO HIEN TAI =====`);
  const thisMon = mondayOf(now);
  const open = new Map<string, { n: number; amt: number; noSched: number; noSchedAmt: number; slipped: number; slippedAmt: number; overdue: number; overdueAmt: number; gap: number[]; monthEnd: number; monthEndAmt: number }>();
  for (const inv of invoices) {
    const rem = Number(inv.originalAmount) - Number(inv.paidAmount);
    if (rem <= 0.5) continue;
    const key = name(inv.salesEmployeeId);
    const r = open.get(key) ?? { n: 0, amt: 0, noSched: 0, noSchedAmt: 0, slipped: 0, slippedAmt: 0, overdue: 0, overdueAmt: 0, gap: [], monthEnd: 0, monthEndAmt: 0 };
    r.n++; r.amt += rem;
    if (inv.dueDate && inv.dueDate < now) { r.overdue++; r.overdueAmt += rem; }
    const e = inv.expectedPaymentDate;
    if (!e) { r.noSched++; r.noSchedAmt += rem; }
    else {
      if (e < thisMon) { r.slipped++; r.slippedAmt += rem; }
      if (inv.dueDate) r.gap.push(Math.round((e.getTime() - inv.dueDate.getTime()) / DAY));
      // ngay du kien roi vao 3 ngay cuoi thang = dau hieu "dat tam cuoi thang"
      const lastDay = new Date(e.getFullYear(), e.getMonth() + 1, 0).getDate();
      if (e.getDate() >= lastDay - 2) { r.monthEnd++; r.monthEndAmt += rem; }
    }
    open.set(key, r);
  }
  for (const [n, r] of [...open.entries()].sort()) {
    const s = [...r.gap].sort((a, b) => a - b);
    console.log(`${n.padEnd(16).slice(0, 16)} con no ${String(r.n).padStart(4)} HD ${M(r.amt)} | qua han ${String(r.overdue).padStart(3)} HD ${M(r.overdueAmt)} | chua co lich ${String(r.noSched).padStart(3)} HD ${M(r.noSchedAmt)} | da truot ${String(r.slipped).padStart(3)} HD ${M(r.slippedAmt)} | du kien 3 ngay cuoi thang ${String(r.monthEnd).padStart(3)} HD ${M(r.monthEndAmt)} | (ngay du kien - han) trung vi ${s.length ? s[Math.floor(s.length / 2)] : "—"} ngay, P80 ${s.length ? s[Math.floor(s.length * 0.8)] : "—"}`);
  }
}
main().finally(() => prisma.$disconnect());
