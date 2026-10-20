import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { normalizeVN } from "./text-normalize";
import { COUNTED_STOP_WHERE, COUNTED_TRIP_WHERE } from "./business-trip-report";
import { workingDeadline } from "./admin-kpi";

/**
 * Lịch chăm sóc khách theo hạng (anh Quân chốt 20/10/2026).
 *
 * HẠNG (xếp lại đầu mỗi tháng từ đơn 12 tháng trước ngày 1 của tháng):
 *  A  = nhóm khách tạo 80% doanh số của NVKD (trong khách còn mua 6 tháng gần nhất) — chạm 7 ngày/lần
 *  B  = còn lại, mua từ 3 đơn/năm — 14 ngày;  C = mua 1–2 đơn/năm — 30 ngày
 *  NGU = không mua 6–12 tháng — 60 ngày (gọi đánh thức). Không mua quá 12 tháng: không vào lịch.
 *  Khách đánh dấu theo vụ / theo dự án: không vào lịch (đã có nhắc theo vụ riêng).
 * "CHẠM" = ghi chăm sóc liên lạc được (không tính "không liên lạc được"), lượt đi gặp đã duyệt (app công tác),
 * hoặc khách có đơn mới. Bắt đầu theo dõi 20/10/2026: khách chưa được chạm từ mốc này thì hạn đầu tiên = mốc + chu kỳ.
 *
 * ĐIỂM CSKH (thay mục "CSKH / Đi gặp KH" trong KPI tháng của NVKD từ tháng 12/2026; tháng 11 chạy thử):
 *  50% chạm đúng hạn + 30% phủ khách A + 20% phản ứng cảnh báo & xử lý vấn đề. Kiểm tra chéo phát hiện ghi khống: −5đ/lần, tối đa −10đ.
 */
export const TIER_CYCLE = { A: 7, B: 14, C: 30, NGU: 60 } as const;
export type Tier = keyof typeof TIER_CYCLE;
export const TIER_LABEL: Record<Tier, string> = { A: "A", B: "B", C: "C", NGU: "Ngủ" };
export const CARE_TRACKING_START = "2026-10-20";
export const CARE_KPI_FROM = { year: 2026, month: 12 };
export const FAKE_PENALTY = 5;
export const FAKE_PENALTY_MAX = 10;
export const ALERT_RESPONSE_WORKDAYS = 2;
export const ISSUE_RESOLVE_DAYS = 7;

const DAY = 86_400_000;
const VN = 7 * 3600_000;
export const vnDay = (t: number) => Math.floor((t + VN) / DAY) * DAY - VN; // 0h VN của ngày chứa t
export const vnDayOf = (ymd: string) => new Date(`${ymd}T00:00:00+07:00`).getTime();
const isSunday = (dayStart: number) => new Date(dayStart + VN).getUTCDay() === 0;
const trackingStart = () => vnDayOf(CARE_TRACKING_START);

// ---------------- Phần thuần (test được) ----------------

export interface TierInput {
  id: string;
  value: number; // doanh số 12 tháng
  orders: number; // số đơn 12 tháng
  lastOrder: number | null;
}

/** Xếp hạng khách của 1 NVKD tại mốc `asOf` (ngày 1 của tháng). Khách không có đơn 12 tháng: không trả về. */
export function classifyTiers(rows: TierInput[], asOf: number): Map<string, Tier> {
  const yearAgo = asOf - 365 * DAY;
  const halfYearAgo = asOf - 182 * DAY;
  const out = new Map<string, Tier>();
  const recent = rows.filter((r) => r.lastOrder != null && r.lastOrder >= yearAgo && r.orders > 0);
  for (const r of recent) if (r.lastOrder! < halfYearAgo) out.set(r.id, "NGU");
  const active = recent.filter((r) => !out.has(r.id)).sort((a, b) => b.value - a.value);
  const total = active.reduce((s, r) => s + Math.max(0, r.value), 0);
  let cum = 0;
  for (const r of active) {
    if (total > 0 && cum < 0.8 * total && r.value > 0) out.set(r.id, "A");
    else out.set(r.id, r.orders >= 3 ? "B" : "C");
    cum += Math.max(0, r.value);
  }
  return out;
}

/** Lần chạm gần nhất ≤ thời điểm t (touches tăng dần), tính cả mốc bắt đầu theo dõi như 1 lần chạm ảo. */
function lastTouchAt(touchesAsc: number[], t: number, start: number): number {
  let last = start <= t ? start : -Infinity;
  for (const x of touchesAsc) {
    if (x > t) break;
    if (x > last) last = x;
  }
  return last;
}

/** Số ngày quá hạn tại ngày `dayStart` (âm = còn |n| ngày nữa mới tới hạn, 0 = hạn hôm nay). */
export function overdueDaysAt(touchesAsc: number[], cycle: number, dayStart: number, start = trackingStart()): number {
  const last = lastTouchAt(touchesAsc, dayStart + DAY - 1, start);
  if (last === -Infinity) return 0;
  const dueDay = vnDay(last) + cycle * DAY;
  return Math.round((dayStart - dueDay) / DAY);
}

/** Ngày làm việc (T2–T7) trong [from, to] — mốc 0h VN. */
export function workingDays(from: number, to: number): number[] {
  const out: number[] = [];
  for (let d = vnDay(from); d <= to; d += DAY) if (!isSunday(d)) out.push(d);
  return out;
}

/** % trung bình theo ngày làm việc của số khách CHƯA quá hạn (null nếu không có khách / không có ngày). */
export function coveragePct(customers: { touches: number[]; cycle: number }[], days: number[], start = trackingStart()): number | null {
  if (customers.length === 0 || days.length === 0) return null;
  let sum = 0;
  for (const d of days) {
    const ok = customers.filter((c) => overdueDaysAt(c.touches, c.cycle, d, start) <= 0).length;
    sum += ok / customers.length;
  }
  return Math.round((sum / days.length) * 1000) / 10;
}

/** Điểm CSKH (0–1): 50% chạm đúng hạn + 30% phủ khách A + 20% trung bình (phản ứng cảnh báo, xử lý vấn đề). Không có dữ liệu = đủ. */
export function careScoreFraction(m: { onTimePct: number | null; aPct: number | null; alertPct: number | null; issuePct: number | null }): number {
  const f = (x: number | null) => (x == null ? 1 : Math.max(0, Math.min(100, x)) / 100);
  return 0.5 * f(m.onTimePct) + 0.3 * f(m.aPct) + 0.2 * ((f(m.alertPct) + f(m.issuePct)) / 2);
}

export const fakePenalty = (fakes: number) => Math.min(FAKE_PENALTY_MAX, FAKE_PENALTY * fakes);

/** Chọn ngẫu nhiên (cố định theo tuần) `n` phần tử — cùng tuần luôn ra cùng danh sách. */
export function pickWeekly<T extends { id: string }>(rows: T[], weekKey: string, n: number): T[] {
  const h = (s: string) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return [...rows].sort((a, b) => h(a.id + weekKey) - h(b.id + weekKey)).slice(0, n);
}

// ---------------- Tải dữ liệu ----------------

export interface PlanCustomer {
  id: string;
  customerCode: string;
  customerName: string;
  employeeId: string;
  tier: Tier;
  cycle: number;
  value12: number;
  lastOrderAt: number | null;
  touches: number[]; // tăng dần, chạm thật
  lastTouch: { at: number; kind: "CARE" | "VISIT" | "ORDER" } | null;
  overdueDays: number; // tại hôm nay
}

export interface CarePlan {
  today: number;
  employees: { id: string; name: string; role: string }[];
  customers: PlanCustomer[];
  /** mọi lần chạm theo khách (kể cả khách ngoài lịch) — dùng cho phản ứng cảnh báo */
  touchesByCustomer: Map<string, number[]>;
}

/** Lịch chăm sóc của các NVKD đang hoạt động (`onlyEmployeeId` = 1 người). */
export async function loadCarePlan(options: { onlyEmployeeId?: string } = {}, now: Date = new Date()): Promise<CarePlan> {
  const today = vnDay(now.getTime());
  const t = new Date(now.getTime() + VN);
  const monthStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1) - VN;
  const only = options.onlyEmployeeId;

  // NVKD + người quản trị trực tiếp phụ trách khách (anh Quân 20/10/2026: khách anh phụ trách cũng vào lịch)
  const employees = await prisma.user.findMany({
    where: { active: true, OR: [{ role: "SALES" }, { customers: { some: {} } }], ...(only ? { id: only } : {}) },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });
  const empIds = employees.map((e) => e.id);
  const customers = await prisma.customer.findMany({
    where: { salesEmployeeId: { in: empIds } },
    select: { id: true, customerCode: true, customerName: true, salesEmployeeId: true, buyingPattern: true },
  });
  const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c.id]));
  const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c.id]));
  const byNorm = new Map(customers.map((c) => [normalizeVN(c.customerName), c.id]));

  const [orders, logs, stops] = await Promise.all([
    prisma.order.findMany({
      where: { orderDate: { gte: new Date(monthStart - 400 * DAY) }, status: { not: "CANCELLED" } },
      select: { customerCode: true, customerName: true, orderDate: true, totalValue: true },
    }),
    prisma.customerCareLog.findMany({
      where: { customerId: { in: customers.map((c) => c.id) }, outcome: { not: "NO_CONTACT" } },
      select: { customerId: true, createdAt: true },
    }),
    prisma.businessTripStop.findMany({
      where: { ...COUNTED_STOP_WHERE, trip: { ...COUNTED_TRIP_WHERE, visitDate: { gte: new Date(monthStart - 120 * DAY) } } },
      select: { companyName: true, trip: { select: { visitDate: true } } },
    }),
  ]);

  const stats = new Map<string, TierInput>();
  const touchesByCustomer = new Map<string, number[]>();
  const kinds = new Map<string, { at: number; kind: "CARE" | "VISIT" | "ORDER" }>();
  const addTouch = (id: string, at: number, kind: "CARE" | "VISIT" | "ORDER") => {
    if (!touchesByCustomer.has(id)) touchesByCustomer.set(id, []);
    touchesByCustomer.get(id)!.push(at);
    const k = kinds.get(id);
    if (!k || at > k.at) kinds.set(id, { at, kind });
  };
  for (const o of orders) {
    const id = (o.customerCode && byCode.get(normalizeCustomerCode(o.customerCode))) || byName.get(o.customerName.trim().toLowerCase());
    if (!id || !o.orderDate) continue;
    const at = o.orderDate.getTime();
    addTouch(id, at, "ORDER");
    if (at < monthStart && at >= monthStart - 365 * DAY) {
      const s = stats.get(id) ?? { id, value: 0, orders: 0, lastOrder: null };
      s.value += Number(o.totalValue);
      s.orders++;
      s.lastOrder = Math.max(s.lastOrder ?? 0, at);
      stats.set(id, s);
    }
  }
  for (const l of logs) addTouch(l.customerId, l.createdAt.getTime(), "CARE");
  for (const s of stops) {
    const id = byNorm.get(normalizeVN(s.companyName));
    if (id) addTouch(id, s.trip.visitDate.getTime(), "VISIT");
  }
  for (const arr of touchesByCustomer.values()) arr.sort((a, b) => a - b);

  const plan: PlanCustomer[] = [];
  for (const e of employees) {
    const mine = customers.filter((c) => c.salesEmployeeId === e.id && c.buyingPattern === "REGULAR");
    const tiers = classifyTiers(mine.map((c) => stats.get(c.id) ?? { id: c.id, value: 0, orders: 0, lastOrder: null }), monthStart);
    for (const c of mine) {
      const tier = tiers.get(c.id);
      if (!tier) continue;
      const touches = touchesByCustomer.get(c.id) ?? [];
      const st = stats.get(c.id);
      plan.push({
        id: c.id,
        customerCode: c.customerCode,
        customerName: c.customerName,
        employeeId: e.id,
        tier,
        cycle: TIER_CYCLE[tier],
        value12: st?.value ?? 0,
        lastOrderAt: st?.lastOrder ?? null,
        touches,
        lastTouch: kinds.get(c.id) ?? null,
        overdueDays: overdueDaysAt(touches, TIER_CYCLE[tier], today),
      });
    }
  }
  return { today, employees, customers: plan, touchesByCustomer };
}

// ---------------- Đánh giá theo kỳ ----------------

export interface CareEvaluation {
  employeeId: string;
  name: string;
  planSize: Record<Tier, number>;
  overdueNow: number;
  overdueA: number;
  onTimePct: number | null;
  aPct: number | null;
  alertPct: number | null;
  alertTotal: number;
  issuePct: number | null;
  issueTotal: number;
  logs: number;
  noContactPct: number | null;
  notePct: number | null;
  newNeeds: number;
  needsConverted: number;
  fakes: number;
  checks: number;
  score: number; // điểm CSKH /10 (chưa trừ ghi khống)
  penalty: number;
}

/** Đánh giá chăm sóc của từng NVKD trong kỳ [from, to] (mốc ms; to tính tới hết ngày). */
export async function evaluateCare(
  range: { from: number; to: number },
  options: { onlyEmployeeId?: string } = {},
  now: Date = new Date(),
  preloaded?: CarePlan
): Promise<CareEvaluation[]> {
  const plan = preloaded ?? (await loadCarePlan(options, now));
  const start = Math.max(range.from, trackingStart());
  const end = Math.min(range.to, plan.today);
  const days = start <= end ? workingDays(start, end) : [];
  const empIds = plan.employees.map((e) => e.id);
  const fromD = new Date(start);
  const toD = new Date(range.to + DAY);

  const [alerts, logs, checks] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: { in: empIds }, type: "CUSTOMER_RISK", link: { contains: "alert=" }, createdAt: { gte: fromD, lt: toD } },
      select: { userId: true, link: true, createdAt: true },
    }),
    prisma.customerCareLog.findMany({
      where: { employeeId: { in: empIds }, createdAt: { gte: new Date(start - 60 * DAY), lt: toD } },
      select: { id: true, customerId: true, employeeId: true, outcome: true, note: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.careSpotCheck.findMany({
      where: { log: { employeeId: { in: empIds } }, createdAt: { gte: fromD, lt: toD } },
      select: { result: true, log: { select: { employeeId: true } } },
    }),
  ]);
  const resolvedAt = new Map<string, number[]>();
  for (const l of logs) if (l.outcome === "RESOLVED") (resolvedAt.get(l.customerId) ?? resolvedAt.set(l.customerId, []).get(l.customerId)!).push(l.createdAt.getTime());

  return plan.employees.map((e) => {
    const mine = plan.customers.filter((c) => c.employeeId === e.id);
    const planSize = { A: 0, B: 0, C: 0, NGU: 0 } as Record<Tier, number>;
    for (const c of mine) planSize[c.tier]++;
    const onTimePct = coveragePct(mine, days);
    const aPct = coveragePct(mine.filter((c) => c.tier === "A"), days);

    // phản ứng cảnh báo nguy cơ: khách được chạm trong 2 ngày làm việc từ lúc báo
    let alertTotal = 0;
    let alertOk = 0;
    for (const a of alerts.filter((x) => x.userId === e.id)) {
      const cid = /customer=([^&]+)/.exec(a.link ?? "")?.[1];
      if (!cid) continue;
      const at = a.createdAt.getTime();
      const deadline = workingDeadline(a.createdAt, ALERT_RESPONSE_WORKDAYS).getTime();
      const ok = (plan.touchesByCustomer.get(cid) ?? []).some((x) => x >= at && x < deadline);
      if (!ok && deadline > now.getTime()) continue; // chưa tới hạn
      alertTotal++;
      if (ok) alertOk++;
    }

    // xử lý vấn đề: ISSUE ghi trong kỳ được "Đã xử lý xong" trong 7 ngày
    let issueTotal = 0;
    let issueOk = 0;
    const mineLogs = logs.filter((l) => l.employeeId === e.id);
    for (const l of mineLogs.filter((x) => x.outcome === "ISSUE" && x.createdAt.getTime() >= start)) {
      const at = l.createdAt.getTime();
      const deadline = at + ISSUE_RESOLVE_DAYS * DAY;
      const ok = (resolvedAt.get(l.customerId) ?? []).some((x) => x > at && x <= deadline);
      if (!ok && deadline > now.getTime()) continue;
      issueTotal++;
      if (ok) issueOk++;
    }

    const inPeriod = mineLogs.filter((l) => l.createdAt.getTime() >= start);
    const needs = mineLogs.filter((l) => l.outcome === "NEW_NEED" && l.createdAt.getTime() >= start);
    const needsConverted = needs.filter((n) =>
      (plan.touchesByCustomer.get(n.customerId) ?? []).some((x) => x > n.createdAt.getTime() && x <= n.createdAt.getTime() + 60 * DAY)
    ).length;
    const myChecks = checks.filter((c) => c.log.employeeId === e.id);
    const fakes = myChecks.filter((c) => c.result === "FAKE").length;
    const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
    const alertPct = pct(alertOk, alertTotal);
    const issuePct = pct(issueOk, issueTotal);

    return {
      employeeId: e.id,
      name: e.name,
      planSize,
      overdueNow: mine.filter((c) => c.overdueDays > 0).length,
      overdueA: mine.filter((c) => c.tier === "A" && c.overdueDays > 0).length,
      onTimePct,
      aPct,
      alertPct,
      alertTotal,
      issuePct,
      issueTotal,
      logs: inPeriod.length,
      noContactPct: pct(inPeriod.filter((l) => l.outcome === "NO_CONTACT").length, inPeriod.length),
      notePct: pct(inPeriod.filter((l) => l.note?.trim()).length, inPeriod.length),
      newNeeds: needs.length,
      needsConverted,
      fakes,
      checks: myChecks.length,
      score: Math.round(careScoreFraction({ onTimePct, aPct, alertPct, issuePct }) * 100) / 10,
      penalty: fakePenalty(fakes),
    };
  });
}

/** Kỳ của 1 tháng (mốc ms 0h VN ngày đầu, 0h VN ngày cuối). */
export function monthRangeVN(year: number, month: number): { from: number; to: number } {
  const from = Date.UTC(year, month - 1, 1) - VN;
  const to = Date.UTC(year, month, 1) - VN - DAY;
  return { from, to };
}

/** Kỳ 7 ngày gần nhất tính tới hôm qua / tuần T2–CN trước. */
export function lastWeekRangeVN(now: Date = new Date()): { from: number; to: number } {
  const today = vnDay(now.getTime());
  const dow = (new Date(today + VN).getUTCDay() + 6) % 7; // 0 = T2
  const thisMonday = today - dow * DAY;
  return { from: thisMonday - 7 * DAY, to: thisMonday - DAY };
}
