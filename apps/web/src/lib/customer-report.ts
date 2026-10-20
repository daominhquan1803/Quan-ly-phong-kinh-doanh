import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { normalizeVN } from "./text-normalize";
import { getCustomerRiskReport } from "./customer-risk-query";
import { loadCarePlan, type Tier } from "./customer-care-plan";
import { openProblem } from "./customer-care-team";
import { classifyItem, groupsText, type GroupKey } from "./product-groups";
import { profileCompleteness, type StageKey, type StatusKey } from "./customer-profile";

/**
 * Báo cáo "Danh sách khách hàng" (anh Quân chốt 20/10/2026): mỗi khách 1 dòng gồm hồ sơ (NVKD nhập), đang mua nhóm
 * sản phẩm gì (tự gom từ đơn 12 tháng), tiến trình mua hàng (gợi ý tự động + NVKD xác nhận), vấn đề, tình trạng hiện tại.
 */
const DAY = 86_400_000;

export interface CustomerReportRow {
  id: string;
  customerCode: string;
  customerName: string;
  employeeId: string | null;
  employeeName: string;
  address: string | null;
  addressAuto: boolean; // địa chỉ lấy từ đơn AMIS (NVKD chưa nhập)
  province: string | null;
  industry: string | null;
  staffSize: string | null;
  ownership: string | null;
  contactPerson: string | null;
  contactPhone: string | null;
  competitors: string | null;
  potentialYear: number | null;
  painPoint: string | null;
  tier: Tier | null;
  pattern: "REGULAR" | "SEASONAL" | "PROJECT";
  orders12: number;
  value12: number;
  gap: number | null; // tiềm năng/năm − đã mua 12 tháng
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  groups: Partial<Record<GroupKey, number>>;
  groupsText: string;
  topGroup: GroupKey | null;
  stage: StageKey | null; // đã xác nhận
  stageSuggested: StageKey;
  stageEffective: StageKey; // đã xác nhận, chưa có thì gợi ý
  stagePrev: StageKey | null; // bản chụp tháng trước
  status: StatusKey;
  riskLevel: string | null;
  lastTouchAt: string | null;
  issue: { type: string | null; note: string | null; since: string } | null;
  unpaidDebt: number;
  overdueDebt: number;
  completeness: number;
  missing: string[];
}

export interface CustomerReport {
  generatedAt: string;
  rows: CustomerReportRow[];
  employees: { id: string; name: string }[];
  summary: { employeeId: string | null; name: string; customers: number; active: number; abCustomers: number; abPct: number | null; allPct: number | null }[];
  unclassifiedItems: { itemCode: string | null; itemName: string; value12: number }[];
  prevSnapshot: { year: number; month: number } | null;
}

/** Tỉnh/thành từ địa chỉ: phần sau "Tỉnh"/"Thành phố"/"TP" cuối cùng. */
export function provinceOf(address: string | null): string | null {
  if (!address) return null;
  const m = address.match(/(?:tỉnh|thành phố|tp\.?)\s+([^,.;-]+?)(?:\s*,\s*việt nam)?\s*[,.;-]?\s*$/i) ?? address.match(/(?:tỉnh|thành phố|tp\.?)\s+([^,.;]+)/i);
  if (!m) return null;
  const p = m[1].trim().replace(/\s+việt nam$/i, "");
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : null;
}

/** Bước tiến trình gợi ý từ dữ liệu. */
export function suggestStage(x: {
  lost: boolean;
  ordersAll: number;
  firstOrder: number | null;
  lastOrder: number | null;
  risky: boolean;
  last6: number;
  prev6: number;
  quotedOrNeed: boolean;
  now: number;
}): StageKey {
  if (x.lost) return "STOPPED";
  if (!x.lastOrder) return x.quotedOrNeed ? "QUOTED" : "PROSPECT";
  if (x.now - x.lastOrder > 182 * DAY) return "STOPPED";
  if (x.risky || (x.prev6 > 0 && x.last6 < 0.5 * x.prev6)) return "DECLINING";
  if (x.ordersAll <= 2 && x.firstOrder && x.now - x.firstOrder <= 182 * DAY) return "TRIAL";
  return "REGULAR";
}

/** Tình trạng hiện tại từ dữ liệu. */
export function statusOf(x: { lost: boolean; risky: boolean; firstOrder: number | null; lastOrder: number | null; now: number }): StatusKey {
  if (x.lost) return "LOST";
  if (!x.lastOrder) return "NEVER";
  const since = x.now - x.lastOrder;
  if (since > 365 * DAY) return "INACTIVE";
  if (x.risky) return "RISK";
  if (since > 182 * DAY) return "SLEEP";
  if (x.firstOrder && x.now - x.firstOrder <= 90 * DAY) return "NEW";
  return "ACTIVE";
}

export async function buildCustomerReport(options: { employeeId?: string; customerId?: string } = {}, now: Date = new Date()): Promise<CustomerReport> {
  const nowMs = now.getTime();
  const since12 = new Date(nowMs - 365 * DAY);
  const only = options.employeeId;

  const customers = await prisma.customer.findMany({
    where: { ...(only ? { salesEmployeeId: only } : {}), ...(options.customerId ? { id: options.customerId } : {}) },
    select: {
      id: true,
      customerCode: true,
      customerName: true,
      contactPerson: true,
      salesEmployeeId: true,
      salesEmployee: { select: { name: true } },
      buyingPattern: true,
      address: true,
      province: true,
      industry: true,
      staffSize: true,
      ownership: true,
      contactPhone: true,
      competitors: true,
      potentialYear: true,
      painPoint: true,
      stage: true,
    },
    orderBy: { customerName: "asc" },
  });
  const ids = customers.map((c) => c.id);
  const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c.id]));
  const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c.id]));
  const idOf = (code: string | null, name: string) => (code && byCode.get(normalizeCustomerCode(code))) || byName.get(name.trim().toLowerCase()) || null;

  const [orderAgg, items, addresses, quotes, logs, risk, invoices, plan, snap, employees, overrides] = await Promise.all([
    prisma.$queryRaw<{ code: string | null; name: string; n: bigint; n12: bigint; first: Date; last: Date; v6: number; vp6: number }[]>`
      SELECT "customerCode" code, "customerName" name, count(*) n,
        count(*) FILTER (WHERE "orderDate" >= ${since12}) n12,
        min("orderDate") first, max("orderDate") last,
        coalesce(sum("totalValue") FILTER (WHERE "orderDate" >= ${new Date(nowMs - 182 * DAY)}), 0)::float8 v6,
        coalesce(sum("totalValue") FILTER (WHERE "orderDate" >= ${since12} AND "orderDate" < ${new Date(nowMs - 182 * DAY)}), 0)::float8 vp6
      FROM orders WHERE status <> 'CANCELLED' AND "orderDate" IS NOT NULL GROUP BY 1, 2`,
    prisma.orderItem.findMany({
      where: { isSample: false, order: { orderDate: { gte: since12 }, status: { not: "CANCELLED" } } },
      select: { itemCode: true, itemName: true, quantity: true, unitPrice: true, order: { select: { customerCode: true, customerName: true } } },
    }),
    prisma.$queryRaw<{ code: string | null; name: string; addr: string | null }[]>`
      SELECT DISTINCT ON (coalesce("customerCode", "customerName")) "customerCode" code, "customerName" name,
        coalesce(nullif("rawData"->>'billing_address', ''), nullif("rawData"->>'shipping_address', '')) addr
      FROM orders WHERE source = 'AMIS_API' AND coalesce(nullif("rawData"->>'billing_address', ''), nullif("rawData"->>'shipping_address', '')) IS NOT NULL
      ORDER BY coalesce("customerCode", "customerName"), "orderDate" DESC NULLS LAST`,
    prisma.quoteRequest.findMany({ select: { customerName: true } }),
    prisma.customerCareLog.findMany({
      where: { customerId: { in: ids } },
      orderBy: { createdAt: "desc" },
      select: { customerId: true, outcome: true, issueType: true, note: true, createdAt: true },
    }),
    getCustomerRiskReport({}),
    prisma.debtInvoice.findMany({ select: { customerCode: true, originalAmount: true, paidAmount: true, dueDate: true } }),
    loadCarePlan({ onlyEmployeeId: only }, now),
    prisma.customerReportSnapshot.findFirst({
      where: { OR: [{ year: { lt: now.getFullYear() } }, { year: now.getFullYear(), month: { lt: now.getMonth() + 1 } }] },
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.user.findMany({ where: { active: true, OR: [{ role: "SALES" }, { customers: { some: {} } }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.itemGroupOverride.findMany(),
  ]);

  // ----- đơn hàng -----
  const ord = new Map<string, { n: number; n12: number; first: number; last: number; v6: number; vp6: number }>();
  for (const o of orderAgg) {
    const id = idOf(o.code, o.name);
    if (!id) continue;
    const a = ord.get(id) ?? { n: 0, n12: 0, first: Infinity, last: 0, v6: 0, vp6: 0 };
    a.n += Number(o.n);
    a.n12 += Number(o.n12);
    a.first = Math.min(a.first, o.first.getTime());
    a.last = Math.max(a.last, o.last.getTime());
    a.v6 += o.v6;
    a.vp6 += o.vp6;
    ord.set(id, a);
  }

  // ----- nhóm sản phẩm -----
  const codes = [...new Set(items.map((i) => i.itemCode).filter((x): x is string => !!x))];
  const inv = await prisma.productInventory.findMany({ where: { itemCode: { in: codes } }, select: { itemCode: true, categoryName: true } });
  const catOf = new Map(inv.map((i) => [i.itemCode, i.categoryName]));
  const ovOf = new Map(overrides.map((o) => [o.itemCode, o.groupKey]));
  const groups = new Map<string, Partial<Record<GroupKey, number>>>();
  const unclassified = new Map<string, { itemCode: string | null; itemName: string; value12: number }>();
  for (const it of items) {
    const id = idOf(it.order.customerCode, it.order.customerName);
    const v = Number(it.quantity) * Number(it.unitPrice);
    const g = classifyItem(it, { override: it.itemCode ? ovOf.get(it.itemCode) : null, category: it.itemCode ? catOf.get(it.itemCode) : null });
    if (g === "KHAC") {
      const k = it.itemCode ?? it.itemName;
      const u = unclassified.get(k) ?? { itemCode: it.itemCode, itemName: it.itemName, value12: 0 };
      u.value12 += v;
      unclassified.set(k, u);
    }
    if (!id) continue;
    const m = groups.get(id) ?? {};
    m[g] = (m[g] ?? 0) + v;
    groups.set(id, m);
  }

  // ----- địa chỉ AMIS, báo giá, chăm sóc, nguy cơ, công nợ -----
  const addrOf = new Map<string, string>();
  for (const a of addresses) {
    const id = idOf(a.code, a.name);
    if (id && a.addr && !addrOf.has(id)) addrOf.set(id, a.addr.trim());
  }
  const quoted = new Set(quotes.map((q) => normalizeVN(q.customerName)));
  const logsBy = new Map<string, typeof logs>();
  for (const l of logs) (logsBy.get(l.customerId) ?? logsBy.set(l.customerId, []).get(l.customerId)!).push(l);
  const riskOf = new Map<string, string>();
  for (const r of risk.rows) {
    const id = idOf(r.customerCode ?? null, r.customerName);
    if (id) riskOf.set(id, r.level);
  }
  const debt = new Map<string, { unpaid: number; overdue: number }>();
  for (const i of invoices) {
    const id = byCode.get(normalizeCustomerCode(i.customerCode));
    if (!id) continue;
    const rem = Math.max(0, Number(i.originalAmount) - Number(i.paidAmount));
    if (rem <= 0) continue;
    const d = debt.get(id) ?? { unpaid: 0, overdue: 0 };
    d.unpaid += rem;
    if (i.dueDate && i.dueDate.getTime() < nowMs) d.overdue += rem;
    debt.set(id, d);
  }
  const tierOf = new Map(plan.customers.map((c) => [c.id, c.tier]));
  const touchOf = (id: string) => {
    const t = plan.touchesByCustomer.get(id);
    return t?.length ? t[t.length - 1] : null;
  };
  const prev = new Map<string, StageKey>();
  if (snap) for (const r of snap.rows as { code: string; stage: StageKey }[]) prev.set(r.code, r.stage);

  const rows: CustomerReportRow[] = customers.map((c) => {
    const o = ord.get(c.id);
    const desc = logsBy.get(c.id) ?? [];
    const problem = openProblem(desc);
    const lost = problem?.kind === "LOST";
    const level = riskOf.get(c.id) ?? null;
    const risky = level === "HIGH" || level === "MEDIUM";
    const first = o && Number.isFinite(o.first) ? o.first : null;
    const last = o?.last || null;
    const g = groups.get(c.id) ?? {};
    const value12 = Object.values(g).reduce((s, v) => s + (v ?? 0), 0);
    const top = (Object.entries(g) as [GroupKey, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const stageSuggested = suggestStage({
      lost,
      ordersAll: o?.n ?? 0,
      firstOrder: first,
      lastOrder: last,
      risky,
      last6: o?.v6 ?? 0,
      prev6: o?.vp6 ?? 0,
      quotedOrNeed: quoted.has(normalizeVN(c.customerName)) || desc.some((l) => l.outcome === "NEW_NEED"),
      now: nowMs,
    });
    const address = c.address?.trim() || addrOf.get(c.id) || null;
    const potential = c.potentialYear != null ? Number(c.potentialYear) : null;
    const issueLog = problem?.kind === "ISSUE" ? desc[problem.index] : null;
    const comp = profileCompleteness({
      address,
      industry: c.industry,
      staffSize: c.staffSize,
      ownership: c.ownership,
      contactPerson: c.contactPerson,
      contactPhone: c.contactPhone,
      stage: c.stage,
      potentialYear: potential,
    });
    const d = debt.get(c.id);
    const lt = touchOf(c.id);
    return {
      id: c.id,
      customerCode: c.customerCode,
      customerName: c.customerName,
      employeeId: c.salesEmployeeId,
      employeeName: c.salesEmployee?.name ?? "(chưa phân)",
      address,
      addressAuto: !c.address?.trim() && !!address,
      province: c.province?.trim() || provinceOf(address),
      industry: c.industry,
      staffSize: c.staffSize,
      ownership: c.ownership,
      contactPerson: c.contactPerson,
      contactPhone: c.contactPhone,
      competitors: c.competitors,
      potentialYear: potential,
      painPoint: c.painPoint,
      tier: tierOf.get(c.id) ?? null,
      pattern: c.buyingPattern,
      orders12: o?.n12 ?? 0,
      value12,
      gap: potential != null ? Math.max(0, potential - value12) : null,
      firstOrderAt: first ? new Date(first).toISOString() : null,
      lastOrderAt: last ? new Date(last).toISOString() : null,
      groups: g,
      groupsText: groupsText(g),
      topGroup: top,
      stage: (c.stage as StageKey | null) ?? null,
      stageSuggested,
      stageEffective: (c.stage as StageKey | null) ?? stageSuggested,
      stagePrev: prev.get(c.customerCode) ?? null,
      status: statusOf({ lost, risky, firstOrder: first, lastOrder: last, now: nowMs }),
      riskLevel: level,
      lastTouchAt: lt ? new Date(lt).toISOString() : null,
      issue: issueLog ? { type: issueLog.issueType, note: issueLog.note, since: issueLog.createdAt.toISOString() } : null,
      unpaidDebt: d?.unpaid ?? 0,
      overdueDebt: d?.overdue ?? 0,
      completeness: comp.pct,
      missing: comp.missing,
    };
  });

  // ----- tổng hợp theo NVKD: % hồ sơ đầy đủ (khách A/B là chỉ tiêu KPI) -----
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, x) => s + x, 0) / xs.length) : null);
  const groupsByEmp = new Map<string | null, CustomerReportRow[]>();
  for (const r of rows) (groupsByEmp.get(r.employeeId) ?? groupsByEmp.set(r.employeeId, []).get(r.employeeId)!).push(r);
  const summary = [...groupsByEmp.entries()].map(([employeeId, rs]) => {
    const ab = rs.filter((r) => r.tier === "A" || r.tier === "B");
    const active = rs.filter((r) => r.orders12 > 0);
    return {
      employeeId,
      name: rs[0].employeeName,
      customers: rs.length,
      active: active.length,
      abCustomers: ab.length,
      abPct: avg(ab.map((r) => r.completeness)),
      allPct: avg(active.map((r) => r.completeness)),
    };
  });
  summary.sort((a, b) => b.active - a.active);

  return {
    generatedAt: now.toISOString(),
    rows,
    employees,
    summary,
    unclassifiedItems: [...unclassified.values()].sort((a, b) => b.value12 - a.value12).slice(0, 200),
    prevSnapshot: snap ? { year: snap.year, month: snap.month } : null,
  };
}

/** % hồ sơ đầy đủ khách A/B theo NVKD — dùng cho KPI tháng (trừ điểm khi thấp). */
export async function profileAbPctByEmployee(now: Date = new Date()): Promise<Map<string, number | null>> {
  const r = await buildCustomerReport({}, now);
  return new Map(r.summary.filter((s) => s.employeeId).map((s) => [s.employeeId!, s.abPct]));
}
