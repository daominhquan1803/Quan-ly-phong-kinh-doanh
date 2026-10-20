import { prisma } from "@hoanggia/db";
import {
  ALERT_RESPONSE_WORKDAYS,
  CARE_TRACKING_START,
  TIER_LABEL,
  evaluateCare,
  lastWeekRangeVN,
  loadCarePlan,
  vnDayOf,
  workingDays,
  type CarePlan,
  type PlanCustomer,
  type Tier,
} from "./customer-care-plan";
import { openProblem } from "./customer-care-team";
import { workingDeadline } from "./admin-kpi";
import { getUnassignedCustomers } from "./customer-care-unassigned";

/**
 * Tin nhắc của lịch chăm sóc (anh Quân chốt 20/10/2026):
 * - 8h mỗi ngày làm việc: NVKD nhận "hôm nay cần chạm N khách" (quá hạn + đến hạn hôm nay, hạng A trước).
 * - Cảnh báo leo thang gửi NGAY cho trưởng phòng (quét 15 phút/lần): khách A quá hạn > 3 ngày; khách nguy cơ cao
 *   2 ngày làm việc không ai chạm; vấn đề mở > 3 ngày; khách đã chuyển NCC khác; NVKD 2 ngày làm việc liền không ghi.
 * - Sáng thứ 2: tổng kết tuần trước cho trưởng phòng.
 * Mỗi tin có `link` riêng làm khoá chống gửi trùng (worker kiểm tra (người nhận, loại, link) trước khi tạo).
 */
const DAY = 86_400_000;
const TIER_ORDER: Record<Tier, number> = { A: 0, B: 1, C: 2, NGU: 3 };
const ymd = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);
const dm = (t: number) => ymd(t).slice(8, 10) + "/" + ymd(t).slice(5, 7);
export const ESCALATE_A_DAYS = 3;
export const ESCALATE_ISSUE_DAYS = 3;

export interface CareMsg {
  userId: string;
  type: "CARE_DUE_DAILY" | "CARE_ESCALATION" | "CARE_WEEKLY";
  title: string;
  message: string;
  link: string;
}

/** Danh sách cần chạm hôm nay của 1 NVKD: quá hạn + đến hạn hôm nay, A trước, quá hạn lâu trước. */
export function dueToday(customers: PlanCustomer[]): PlanCustomer[] {
  return customers
    .filter((c) => c.overdueDays >= 0)
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.overdueDays - a.overdueDays || b.value12 - a.value12);
}

export function buildDailyMessage(employeeId: string, list: PlanCustomer[], today: number): CareMsg | null {
  if (list.length === 0) return null;
  const overdue = list.filter((c) => c.overdueDays > 0).length;
  const aCount = list.filter((c) => c.tier === "A").length;
  const show = list
    .slice(0, 12)
    .map((c) => `${c.customerCode} (${TIER_LABEL[c.tier]}${c.overdueDays > 0 ? `, trễ ${c.overdueDays} ngày` : ""})`)
    .join(", ");
  return {
    userId: employeeId,
    type: "CARE_DUE_DAILY",
    title: `Hôm nay cần chạm ${list.length} khách${aCount ? ` (${aCount} khách A)` : ""}`,
    message:
      `${overdue ? `${overdue} khách đã quá hạn chăm sóc. ` : ""}Cần liên hệ: ${show}${list.length > 12 ? ` và ${list.length - 12} khách nữa` : ""}. ` +
      `Ghi kết quả ở trang Chăm sóc (đi gặp qua app công tác và đơn mới tự tính).`,
    link: `/cham-soc?due=${ymd(today)}`,
  };
}

export interface CarePlanAlerts {
  daily: CareMsg[];
  escalations: CareMsg[];
  weekly: CareMsg[];
}

/** Tính toàn bộ tin nhắc — worker gọi qua /api/internal/care-plan. */
export async function buildCareAlerts(now: Date = new Date(), opts: { weekly?: boolean } = {}): Promise<CarePlanAlerts> {
  const plan = await loadCarePlan({}, now);
  const managers = await prisma.user.findMany({ where: { role: "ADMIN", accessLevel: "FULL", active: true }, select: { id: true } });
  const managerIds = managers.map((m) => m.id);
  const nameOf = new Map(plan.employees.map((e) => [e.id, e.name]));

  // ----- 8h: lịch cần chạm của từng NVKD -----
  const daily: CareMsg[] = [];
  for (const e of plan.employees) {
    const msg = buildDailyMessage(e.id, dueToday(plan.customers.filter((c) => c.employeeId === e.id)), plan.today);
    if (msg) daily.push(msg);
  }

  const escalations = await buildEscalations(plan, managerIds, nameOf, now);

  // ----- thứ 2: tổng kết tuần trước -----
  const weekly: CareMsg[] = [];
  if (opts.weekly && lastWeekRangeVN(now).to >= vnDayOf(CARE_TRACKING_START)) {
    const range = lastWeekRangeVN(now);
    const evals = await evaluateCare(range, {}, now, plan);
    const pct = (x: number | null) => (x == null ? "—" : `${Math.round(x)}%`);
    const lines = evals
      .sort((a, b) => b.score - a.score)
      .map((v) => `${v.name}: đúng hạn ${pct(v.onTimePct)}, khách A ${pct(v.aPct)}, đang quá hạn ${v.overdueNow} (A: ${v.overdueA}), cơ hội mới ${v.newNeeds}, điểm ${v.score}/10`);
    for (const id of managerIds) {
      weekly.push({
        userId: id,
        type: "CARE_WEEKLY",
        title: `Chăm sóc khách tuần ${dm(range.from)}–${dm(range.to)}`,
        message: lines.join(". ") + ".",
        link: `/cham-soc?weekly=${ymd(range.from)}`,
      });
    }
  }
  return { daily, escalations, weekly };
}

async function buildEscalations(plan: CarePlan, managerIds: string[], nameOf: Map<string, string>, now: Date): Promise<CareMsg[]> {
  const out: CareMsg[] = [];
  const toManagers = (title: string, message: string, link: string) => managerIds.forEach((userId) => out.push({ userId, type: "CARE_ESCALATION", title, message, link }));
  const byId = new Map(plan.customers.map((c) => [c.id, c]));

  // (1) khách A quá hạn > 3 ngày
  for (const c of plan.customers) {
    if (c.tier !== "A" || c.overdueDays <= ESCALATE_A_DAYS) continue;
    const due = plan.today - c.overdueDays * DAY;
    toManagers(
      `Khách A quá hạn ${c.overdueDays} ngày: ${c.customerCode}`,
      `${c.customerName} (${nameOf.get(c.employeeId)}) chưa được chăm sóc, hạn ${dm(due)}. Khách hạng A phải chạm 7 ngày/lần.`,
      `/cham-soc?customer=${c.id}&esc=A&due=${ymd(due)}`
    );
  }

  // (2) cảnh báo nguy cơ cao, 2 ngày làm việc không ai chạm
  const risks = await prisma.notification.findMany({
    where: { type: "CUSTOMER_RISK", link: { contains: "alert=HIGH" }, createdAt: { gte: new Date(now.getTime() - 14 * DAY) } },
    select: { userId: true, link: true, title: true, createdAt: true },
  });
  const seenRisk = new Set<string>();
  for (const r of risks) {
    const cid = /customer=([^&]+)/.exec(r.link ?? "")?.[1];
    if (!cid || seenRisk.has(cid)) continue;
    const deadline = workingDeadline(r.createdAt, ALERT_RESPONSE_WORKDAYS).getTime();
    if (deadline > now.getTime()) continue;
    const touched = (plan.touchesByCustomer.get(cid) ?? []).some((t) => t >= r.createdAt.getTime());
    if (touched) continue;
    seenRisk.add(cid);
    const c = byId.get(cid);
    toManagers(
      `Khách nguy cơ cao chưa ai liên hệ: ${c?.customerCode ?? r.title.replace(/^\[[^\]]*\]\s*/, "")}`,
      `${c?.customerName ?? r.title} — đã báo ${nameOf.get(r.userId) ?? "NVKD"} từ ${dm(r.createdAt.getTime())}, quá ${ALERT_RESPONSE_WORKDAYS} ngày làm việc chưa có chăm sóc / đi gặp / đơn mới.`,
      `/cham-soc?customer=${cid}&esc=RISK&since=${ymd(r.createdAt.getTime())}`
    );
  }

  // (3) vấn đề mở > 3 ngày, (4) khách đã chuyển NCC khác (trong 3 ngày — bình thường đã báo ngay lúc ghi)
  const flagged = await prisma.customerCareLog.findMany({
    where: { outcome: { in: ["ISSUE", "LOST"] } },
    select: { customerId: true },
    distinct: ["customerId"],
  });
  if (flagged.length) {
    const logs = await prisma.customerCareLog.findMany({
      where: { customerId: { in: flagged.map((f) => f.customerId) } },
      orderBy: { createdAt: "desc" },
      select: { id: true, customerId: true, outcome: true, note: true, createdAt: true, employee: { select: { name: true } }, customer: { select: { customerCode: true, customerName: true } } },
    });
    const byCustomer = new Map<string, typeof logs>();
    for (const l of logs) (byCustomer.get(l.customerId) ?? byCustomer.set(l.customerId, []).get(l.customerId)!).push(l);
    for (const [cid, desc] of byCustomer) {
      const p = openProblem(desc);
      if (!p || p.kind === "NO_CONTACT") continue;
      const l = desc[p.index];
      const age = (now.getTime() - l.createdAt.getTime()) / DAY;
      if (p.kind === "ISSUE" && age > ESCALATE_ISSUE_DAYS) {
        toManagers(
          `Vấn đề khách chưa xử lý ${Math.floor(age)} ngày: ${l.customer.customerCode}`,
          `${l.customer.customerName}: ${l.note ?? "có vấn đề"} (ghi bởi ${l.employee.name} ngày ${dm(l.createdAt.getTime())}). Cần ghi "Đã xử lý xong vấn đề" khi giải quyết.`,
          `/cham-soc?customer=${cid}&esc=ISSUE&log=${l.id}`
        );
      }
      if (p.kind === "LOST" && age <= 3) out.push(...lostMessages(managerIds, cid, l.id, l.customer, l.employee.name, l.note));
    }
  }

  // (5) NVKD 2 ngày làm việc liền không ghi chăm sóc nào
  const start = vnDayOf(CARE_TRACKING_START);
  const prevDays = workingDays(plan.today - 9 * DAY, plan.today - DAY).slice(-2);
  if (prevDays.length === 2 && prevDays[0] >= start) {
    const logged = await prisma.customerCareLog.findMany({
      where: { createdAt: { gte: new Date(prevDays[0]), lt: new Date(prevDays[1] + DAY) } },
      select: { employeeId: true },
      distinct: ["employeeId"],
    });
    const ok = new Set(logged.map((l) => l.employeeId));
    for (const e of plan.employees) {
      if (ok.has(e.id) || e.role !== "SALES") continue; // quản trị viên tự phụ trách khách thì không tự báo chính mình
      toManagers(
        `${e.name} 2 ngày làm việc không ghi chăm sóc`,
        `${e.name} không có lần ghi chăm sóc khách nào ngày ${dm(prevDays[0])} và ${dm(prevDays[1])}.`,
        `/cham-soc?esc=NOLOG&emp=${e.id}&d=${ymd(plan.today)}`
      );
    }
  }
  // (6) khách đang mua nhưng chưa có người phụ trách — nhắc anh phân, mỗi tuần 1 lần cho tới khi phân xong
  const unassigned = (await getUnassignedCustomers(now)).filter((u) => u.orders12 > 0);
  if (unassigned.length > 0) {
    const dow = (new Date(plan.today + 7 * 3600_000).getUTCDay() + 6) % 7;
    const monday = plan.today - dow * DAY;
    const top = unassigned.slice(0, 5).map((u) => u.customerCode ?? u.customerName).join(", ");
    toManagers(
      `${unassigned.length} khách đang mua chưa có người phụ trách`,
      `${top}${unassigned.length > 5 ? ` và ${unassigned.length - 5} khách nữa` : ""} chưa nằm trong lịch chăm sóc của ai. Vào trang Chăm sóc, mục Khách chưa có người phụ trách để phân.`,
      `/cham-soc?unassigned=${ymd(monday)}`
    );
  }
  return out;
}

/** Tin "khách đã chuyển NCC khác" — gửi ngay lúc NVKD ghi (route POST) và quét lại phòng khi lỗi; cùng link nên không trùng. */
export function lostMessages(
  managerIds: string[],
  customerId: string,
  logId: string,
  customer: { customerCode: string; customerName: string },
  employeeName: string,
  note: string | null
): CareMsg[] {
  return managerIds.map((userId) => ({
    userId,
    type: "CARE_ESCALATION" as const,
    title: `Mất khách: ${customer.customerCode} đã chuyển NCC khác`,
    message: `${customer.customerName} — ${employeeName} ghi nhận khách đã chuyển nhà cung cấp khác${note ? `: ${note}` : ""}.`,
    link: `/cham-soc?customer=${customerId}&esc=LOST&log=${logId}`,
  }));
}
