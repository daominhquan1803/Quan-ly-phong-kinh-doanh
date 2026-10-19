import { prisma } from "@hoanggia/db";
import { getCareOverview, getUncaredRisks, vnToday, type UncaredRisk } from "./customer-care-query";

/**
 * Thống kê chăm sóc khách của cả phòng trong 1 ngày (anh Quân yêu cầu 19/10/2026): mỗi thành viên chăm sóc bao nhiêu
 * khách, ai chưa chăm sóc ngày nào, cảnh báo (nguy cơ mất khách, đến hạn hẹn lại, tới vụ) và các vấn đề cần xử lý
 * (khách có vấn đề, khách đã chuyển NCC khác, không liên lạc được nhiều lần).
 */
const DAY = 86_400_000;

export function vnDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+07:00`);
}

export function todayYmd(now: Date = new Date()): string {
  const t = vnToday(now);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

export interface MemberStat {
  id: string;
  name: string;
  assigned: number;
  today: { customers: number; logs: number; byOutcome: Record<string, number>; byChannel: Record<string, number> };
  week: number;
  month: number;
  warnings: { risk: number; followUps: number; season: number };
  openIssues: number;
}

export interface CareDetail {
  employeeId: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  outcome: string;
  channel: string;
  note: string | null;
  issueType: string | null;
  expectedMonth: number | null;
  needGroup: string | null;
  needValueBand: string | null;
  at: string;
}

export interface TeamIssue {
  customerId: string;
  customerCode: string;
  customerName: string;
  employeeId: string | null;
  employeeName: string | null;
  kind: "ISSUE" | "LOST" | "NO_CONTACT";
  issueType: string | null;
  note: string | null;
  since: string;
  days: number;
  loggedBy: string;
}

export interface CareTeamReport {
  date: string;
  members: MemberStat[];
  totals: { customers: number; logs: number; membersCared: number; membersTotal: number };
  /** Chi tiết từng lần ghi chăm sóc TRONG NGÀY chọn, mới nhất trước — UI chia cột theo thành viên. */
  details: CareDetail[];
  risks: (UncaredRisk & { employeeName: string })[];
  followUps: { customerId: string; customerCode: string; customerName: string; employeeId: string; employeeName: string; followUpAt: string; overdueDays: number }[];
  seasons: { customerId: string; customerCode: string; customerName: string; employeeId: string; employeeName: string; stage: string; seasonMonth: number }[];
  issues: TeamIssue[];
  opportunities: { customerId: string; customerCode: string; customerName: string; employeeId: string; employeeName: string; needGroup: string | null; needValueBand: string | null; expectedMonth: number | null; at: string }[];
}

/** `onlyEmployeeId` = phạm vi SALES (chỉ thấy số liệu của mình); bỏ trống = cả phòng (ADMIN). */
export async function getCareTeamReport(options: { date?: string; onlyEmployeeId?: string }, now: Date = new Date()): Promise<CareTeamReport> {
  const date = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : todayYmd(now);
  const dayStart = vnDayStart(date);
  const dayEnd = new Date(dayStart.getTime() + DAY);
  const weekStart = new Date(dayStart.getTime() - 6 * DAY);
  const monthStart = vnDayStart(`${date.slice(0, 7)}-01`);
  const only = options.onlyEmployeeId;

  const [sales, overview, logs, risks] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: "SALES", ...(only ? { id: only } : {}) },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    getCareOverview({ onlyEmployeeId: only }, now),
    prisma.customerCareLog.findMany({
      where: { createdAt: { gte: monthStart < weekStart ? monthStart : weekStart, lt: dayEnd }, ...(only ? { employeeId: only } : {}) },
      select: {
        customerId: true,
        employeeId: true,
        outcome: true,
        channel: true,
        note: true,
        issueType: true,
        expectedMonth: true,
        needGroup: true,
        needValueBand: true,
        createdAt: true,
        employee: { select: { name: true } },
        customer: { select: { customerCode: true, customerName: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    only ? Promise.resolve([] as UncaredRisk[]) : getUncaredRisks(now),
  ]);

  // thành viên: NVKD đang hoạt động + người khác (vd admin) có ghi chăm sóc trong kỳ
  const names = new Map(sales.map((s) => [s.id, s.name]));
  for (const l of logs) if (!names.has(l.employeeId)) names.set(l.employeeId, l.employee.name);
  const nameOf = (id: string | null | undefined) => (id ? names.get(id) ?? "—" : "—");

  const stat = new Map<string, MemberStat>();
  const customersToday = new Map<string, Set<string>>();
  const customersWeek = new Map<string, Set<string>>();
  const customersMonth = new Map<string, Set<string>>();
  for (const [id, name] of names) {
    stat.set(id, {
      id,
      name,
      assigned: 0,
      today: { customers: 0, logs: 0, byOutcome: {}, byChannel: {} },
      week: 0,
      month: 0,
      warnings: { risk: 0, followUps: 0, season: 0 },
      openIssues: 0,
    });
    customersToday.set(id, new Set());
    customersWeek.set(id, new Set());
    customersMonth.set(id, new Set());
  }
  for (const c of overview) if (c.salesEmployee && stat.has(c.salesEmployee.id)) stat.get(c.salesEmployee.id)!.assigned++;

  const details: CareDetail[] = [];
  for (const l of logs) {
    const s = stat.get(l.employeeId);
    if (!s) continue;
    const t = l.createdAt.getTime();
    if (t >= dayStart.getTime()) {
      details.push({
        employeeId: l.employeeId,
        customerId: l.customerId,
        customerCode: l.customer.customerCode,
        customerName: l.customer.customerName,
        outcome: l.outcome,
        channel: l.channel,
        note: l.note,
        issueType: l.issueType,
        expectedMonth: l.expectedMonth,
        needGroup: l.needGroup,
        needValueBand: l.needValueBand,
        at: l.createdAt.toISOString(),
      });
    }
    if (t >= monthStart.getTime()) customersMonth.get(l.employeeId)!.add(l.customerId);
    if (t >= weekStart.getTime()) customersWeek.get(l.employeeId)!.add(l.customerId);
    if (t >= dayStart.getTime()) {
      customersToday.get(l.employeeId)!.add(l.customerId);
      s.today.logs++;
      s.today.byOutcome[l.outcome] = (s.today.byOutcome[l.outcome] ?? 0) + 1;
      s.today.byChannel[l.channel] = (s.today.byChannel[l.channel] ?? 0) + 1;
    }
  }
  for (const [id, s] of stat) {
    s.today.customers = customersToday.get(id)!.size;
    s.week = customersWeek.get(id)!.size;
    s.month = customersMonth.get(id)!.size;
  }

  // ----- cảnh báo -----
  const riskRows = risks.map((r) => ({ ...r, employeeName: nameOf(r.employeeId) }));
  for (const r of risks) if (stat.has(r.employeeId)) stat.get(r.employeeId)!.warnings.risk++;

  const followUps: CareTeamReport["followUps"] = [];
  const seasons: CareTeamReport["seasons"] = [];
  for (const c of overview) {
    const emp = c.salesEmployee?.id;
    if (!emp) continue;
    if (c.followUpAt && new Date(c.followUpAt).getTime() <= dayEnd.getTime() - 1) {
      // trễ theo NGÀY LỊCH (hẹn 16/10 thì đến 19/10 là trễ 3 ngày), không theo giờ
      const dueDay = Math.floor((new Date(c.followUpAt).getTime() + 7 * 3600_000) / DAY) * DAY - 7 * 3600_000;
      const overdueDays = Math.max(0, Math.round((dayStart.getTime() - dueDay) / DAY));
      followUps.push({ customerId: c.id, customerCode: c.customerCode, customerName: c.customerName, employeeId: emp, employeeName: nameOf(emp), followUpAt: c.followUpAt, overdueDays });
      stat.get(emp)!.warnings.followUps++;
    }
    if (c.season) {
      seasons.push({ customerId: c.id, customerCode: c.customerCode, customerName: c.customerName, employeeId: emp, employeeName: nameOf(emp), stage: c.season.stage, seasonMonth: c.season.seasonMonth });
      stat.get(emp)!.warnings.season++;
    }
  }
  followUps.sort((a, b) => b.overdueDays - a.overdueDays);

  // ----- vấn đề cần xử lý: lần ghi MỚI NHẤT của khách là ISSUE / LOST, hoặc không liên lạc được từ 2 lần liên tiếp -----
  const lastAtByCustomer = new Map(overview.map((c) => [c.id, c.lastCareAt]));
  const empByCustomer = new Map(overview.map((c) => [c.id, c.salesEmployee]));
  const customerIds = new Set(overview.map((c) => c.id));
  const problemLogs = await prisma.customerCareLog.findMany({
    where: { outcome: { in: ["ISSUE", "LOST", "NO_CONTACT"] }, ...(only ? { customerId: { in: [...customerIds] } } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      customerId: true,
      outcome: true,
      issueType: true,
      note: true,
      createdAt: true,
      customer: { select: { customerCode: true, customerName: true } },
      employee: { select: { name: true } },
    },
  });
  const issues: TeamIssue[] = [];
  const noContactCount = new Map<string, number>();
  const seen = new Set<string>();
  for (const l of problemLogs) {
    const last = lastAtByCustomer.get(l.customerId);
    if (!last || new Date(last).getTime() !== l.createdAt.getTime()) continue; // đã có ghi chăm sóc mới hơn -> coi như đã xử lý
    if (seen.has(l.customerId)) continue;
    seen.add(l.customerId);
    if (l.outcome === "NO_CONTACT") {
      // đếm số lần không liên lạc được liên tiếp tính ngược từ lần mới nhất
      noContactCount.set(l.customerId, 1);
    }
    const emp = empByCustomer.get(l.customerId);
    issues.push({
      customerId: l.customerId,
      customerCode: l.customer.customerCode,
      customerName: l.customer.customerName,
      employeeId: emp?.id ?? null,
      employeeName: emp?.name ?? null,
      kind: l.outcome as TeamIssue["kind"],
      issueType: l.issueType,
      note: l.note,
      since: l.createdAt.toISOString(),
      days: Math.max(0, Math.floor((now.getTime() - l.createdAt.getTime()) / DAY)),
      loggedBy: l.employee.name,
    });
  }
  // NO_CONTACT chỉ coi là vấn đề khi liên tiếp từ 2 lần trở lên
  if (noContactCount.size > 0) {
    const consecutive = new Map<string, number>();
    const all = await prisma.customerCareLog.findMany({
      where: { customerId: { in: [...noContactCount.keys()] } },
      orderBy: { createdAt: "desc" },
      select: { customerId: true, outcome: true },
    });
    const done = new Set<string>();
    for (const l of all) {
      if (done.has(l.customerId)) continue;
      if (l.outcome === "NO_CONTACT") consecutive.set(l.customerId, (consecutive.get(l.customerId) ?? 0) + 1);
      else done.add(l.customerId);
    }
    for (let i = issues.length - 1; i >= 0; i--) {
      if (issues[i].kind === "NO_CONTACT" && (consecutive.get(issues[i].customerId) ?? 0) < 2) issues.splice(i, 1);
    }
  }
  issues.sort((a, b) => (a.kind === b.kind ? b.days - a.days : a.kind === "LOST" ? -1 : b.kind === "LOST" ? 1 : a.kind === "ISSUE" ? -1 : 1));
  for (const i of issues) if (i.employeeId && stat.has(i.employeeId)) stat.get(i.employeeId)!.openIssues++;

  // ----- cơ hội bán hàng mới trong 30 ngày gần nhất (NEW_NEED) — thông tin để trưởng phòng theo dõi -----
  const needs = await prisma.customerCareLog.findMany({
    where: { outcome: "NEW_NEED", createdAt: { gte: new Date(dayEnd.getTime() - 30 * DAY), lt: dayEnd }, ...(only ? { employeeId: only } : {}) },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { customerId: true, employeeId: true, needGroup: true, needValueBand: true, expectedMonth: true, createdAt: true, customer: { select: { customerCode: true, customerName: true } }, employee: { select: { name: true } } },
  });

  const members = [...stat.values()].sort((a, b) => b.today.customers - a.today.customers || a.name.localeCompare(b.name, "vi"));
  return {
    date,
    members,
    totals: {
      customers: members.reduce((s, m) => s + m.today.customers, 0),
      logs: members.reduce((s, m) => s + m.today.logs, 0),
      membersCared: members.filter((m) => m.today.customers > 0).length,
      membersTotal: members.length,
    },
    details,
    risks: riskRows,
    followUps,
    seasons,
    issues,
    opportunities: needs.map((n) => ({
      customerId: n.customerId,
      customerCode: n.customer.customerCode,
      customerName: n.customer.customerName,
      employeeId: n.employeeId,
      employeeName: n.employee.name,
      needGroup: n.needGroup,
      needValueBand: n.needValueBand,
      expectedMonth: n.expectedMonth,
      at: n.createdAt.toISOString(),
    })),
  };
}
