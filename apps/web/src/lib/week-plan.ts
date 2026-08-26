import { prisma } from "@hoanggia/db";
import { WeekPlanMetric } from "@prisma/client";
import { normalizeVN } from "./text-normalize";

/**
 * Kế hoạch làm việc tuần — theo đúng file mẫu "KẾ HOẠCH LÀM VIỆC TUẦN" anh Quân gửi.
 * 6 đầu mục cố định (WeekPlanMetric):
 *  - 3 mục đầu (NEW_CONTACT/NEW_MEETING/EXISTING_VISIT): NVKD tự ghi lại từng khách hàng đã
 *    liên hệ/gặp (WeekPlanResultEntry) — qua form nhập từng dòng hoặc tải file Excel theo đúng
 *    cấu trúc sheet "KẾT QUẢ" trong file mẫu.
 *  - 3 mục sau: tính TỰ ĐỘNG, không cần nhập tay —
 *      NEW_CUSTOMER_SALE: khách hàng có đơn hàng trong tuần mà CHƯA TỪNG mua hàng trước đó, hoặc
 *        đã dừng mua ít nhất 1 năm tính từ đơn hàng cuối cùng (đúng tiêu chí anh Quân xác nhận) —
 *        đối chiếu lịch sử đơn hàng của khách trên TOÀN CÔNG TY (Order, mọi NVKD từng bán cho
 *        khách đó), không giới hạn riêng NVKD đang xét — vì "khách hàng mới/cũ" là đặc tính của
 *        khách hàng với công ty, không phải với 1 NVKD cụ thể.
 *      NEW_QUOTE: số báo giá phát sinh trong tuần theo User.quoteAssigneeCode (QuoteRequest).
 *      BUSINESS_TRIP: số NGÀY có lượt đi công tác đã duyệt (chính hoặc hỗ trợ) trong tuần — mỗi
 *        ngày tính 1 buổi dù có nhiều lượt đi cùng ngày, đúng yêu cầu "mỗi ngày tính 1 buổi".
 * Chỉ tiêu (targetValue) cho CẢ 6 mục do Quản trị viên nhập, có thể nhập trước cho tuần tương lai.
 */

export const WEEK_PLAN_METRICS: WeekPlanMetric[] = [
  "NEW_CONTACT",
  "NEW_MEETING",
  "EXISTING_VISIT",
  "NEW_CUSTOMER_SALE",
  "NEW_QUOTE",
  "BUSINESS_TRIP",
];

export const MANUAL_METRICS: WeekPlanMetric[] = ["NEW_CONTACT", "NEW_MEETING", "EXISTING_VISIT"];
export const AUTO_METRICS: WeekPlanMetric[] = ["NEW_CUSTOMER_SALE", "NEW_QUOTE", "BUSINESS_TRIP"];

export function isManualMetric(m: WeekPlanMetric): boolean {
  return (MANUAL_METRICS as string[]).includes(m);
}

export const WEEK_PLAN_METRIC_LABEL: Record<WeekPlanMetric, string> = {
  NEW_CONTACT: "Số khách hàng liên hệ mới",
  NEW_MEETING: "Số khách hàng mới hẹn gặp được",
  EXISTING_VISIT: "Số khách hàng cũ liên hệ gặp thăm hỏi",
  NEW_CUSTOMER_SALE: "Số khách hàng mới bán được hàng",
  NEW_QUOTE: "Số báo giá mới",
  BUSINESS_TRIP: "Số buổi đi công tác",
};

export const WEEK_PLAN_METRIC_NOTE: Record<WeekPlanMetric, string> = {
  NEW_CONTACT:
    "Khách hàng chưa từng mua hàng, hoặc khách cũ đã dừng mua ít nhất 1 năm tính từ đơn hàng cuối cùng — NVKD tự ghi lại danh sách đã liên hệ.",
  NEW_MEETING:
    "Khách hàng chưa từng mua hàng, hoặc khách cũ đã dừng mua ít nhất 1 năm tính từ đơn hàng cuối cùng — NVKD tự ghi lại danh sách đã hẹn gặp.",
  EXISTING_VISIT:
    "Khách hàng đang mua hàng, hoặc khách dừng mua dưới 1 năm tính từ đơn hàng cuối cùng — NVKD tự ghi lại danh sách đã liên hệ/thăm hỏi.",
  NEW_CUSTOMER_SALE:
    "Tự động — đếm khách hàng có đơn trong tuần mà chưa từng mua hàng trước đó, hoặc đã dừng mua ít nhất 1 năm tính từ đơn hàng cuối cùng (đối chiếu toàn bộ lịch sử đơn hàng công ty, không riêng NVKD này).",
  NEW_QUOTE: "Tự động — đếm số báo giá phát sinh trong tuần theo dữ liệu Báo giá.",
  BUSINESS_TRIP: "Tự động — đếm số ngày có lượt đi công tác đã duyệt trong tuần (mỗi ngày tính 1 buổi).",
};

type ManualMetric = "NEW_CONTACT" | "NEW_MEETING" | "EXISTING_VISIT";

/** Mục trong sheet "KẾT QUẢ" file mẫu → metric — so khớp mờ (không dấu, hoa/thường) vì cách ghi
 * có thể khác nhau đôi chút giữa các lần tải file. */
export function matchMetricFromSectionLabel(label: string): ManualMetric | null {
  const n = normalizeVN(label);
  if (!n) return null;
  if (n.includes("cu") && (n.includes("tham hoi") || n.includes("gap") || n.includes("lien he"))) return "EXISTING_VISIT";
  if (n.includes("moi") && n.includes("hen gap")) return "NEW_MEETING";
  if (n.includes("moi") && n.includes("lien he")) return "NEW_CONTACT";
  return null;
}

// ---------- Tuần (luôn quy về 00:00 thứ Hai) ----------

export function startOfWeek(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = date.getDay(); // 0=CN..6=T7
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return date;
}

export function weekRange(weekStartInput: Date): { start: Date; end: Date } {
  const start = startOfWeek(weekStartInput);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

export function addWeeks(weekStart: Date, n: number): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + n * 7);
  return d;
}

function fmtDM(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatWeekLabel(weekStart: Date): string {
  const { start, end } = weekRange(weekStart);
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  return `Tuần ${fmtDM(start)} – ${fmtDM(last)}/${last.getFullYear()}`;
}

// ---------- Danh sách nhân viên áp dụng (cùng quy ước với Kế hoạch kinh doanh/KPI) ----------

async function getEligibleEmployees() {
  return prisma.user.findMany({
    where: { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true },
    select: { id: true, name: true, quoteAssigneeCode: true },
    orderBy: { name: "asc" },
  });
}

// ---------- Tính tự động 3 mục cuối ----------

type AutoCounts = Record<"NEW_CUSTOMER_SALE" | "NEW_QUOTE" | "BUSINESS_TRIP", number>;

async function computeAutoMetrics(
  weekStart: Date,
  employees: { id: string; quoteAssigneeCode: string | null }[]
): Promise<Map<string, AutoCounts>> {
  const { start, end } = weekRange(weekStart);
  const employeeIds = employees.map((e) => e.id);
  const result = new Map<string, AutoCounts>(
    employeeIds.map((id) => [id, { NEW_CUSTOMER_SALE: 0, NEW_QUOTE: 0, BUSINESS_TRIP: 0 }])
  );
  if (employeeIds.length === 0) return result;

  // ---- NEW_CUSTOMER_SALE ----
  // "Khách hàng mới" là đặc tính của khách với CÔNG TY (không riêng NVKD nào) — chưa từng mua,
  // hoặc lần mua gần nhất cách đây >= 1 năm. Nên bước 2 đối chiếu lịch sử KHÔNG lọc theo
  // salesEmployeeId, lấy trên toàn bộ Order (đúng dữ liệu đã đồng bộ từ AMIS CRM).
  const weekOrders = await prisma.order.findMany({
    where: { orderDate: { gte: start, lt: end }, salesEmployeeId: { in: employeeIds } },
    select: { salesEmployeeId: true, customerName: true },
  });
  const pairsByEmployee = new Map<string, Set<string>>();
  const allWeekCustomerNames = new Set<string>();
  for (const o of weekOrders) {
    if (!o.salesEmployeeId) continue;
    if (!pairsByEmployee.has(o.salesEmployeeId)) pairsByEmployee.set(o.salesEmployeeId, new Set());
    pairsByEmployee.get(o.salesEmployeeId)!.add(o.customerName);
    allWeekCustomerNames.add(o.customerName);
  }
  const lastPriorOrderByCustomer = new Map<string, Date>();
  if (allWeekCustomerNames.size > 0) {
    const priorOrders = await prisma.order.groupBy({
      by: ["customerName"],
      where: { customerName: { in: Array.from(allWeekCustomerNames) }, orderDate: { lt: start } },
      _max: { orderDate: true },
    });
    for (const p of priorOrders) {
      if (p._max.orderDate) lastPriorOrderByCustomer.set(p.customerName, p._max.orderDate);
    }
  }
  const oneYearBeforeStart = new Date(start);
  oneYearBeforeStart.setFullYear(oneYearBeforeStart.getFullYear() - 1);
  for (const [employeeId, customerSet] of pairsByEmployee) {
    let newCount = 0;
    for (const customerName of customerSet) {
      const lastPrior = lastPriorOrderByCustomer.get(customerName);
      if (!lastPrior || lastPrior <= oneYearBeforeStart) newCount++;
    }
    result.get(employeeId)!.NEW_CUSTOMER_SALE = newCount;
  }

  // ---- NEW_QUOTE ----
  const codeToEmployee = new Map(
    employees.filter((e) => e.quoteAssigneeCode).map((e) => [e.quoteAssigneeCode as string, e.id])
  );
  if (codeToEmployee.size > 0) {
    const monthsTouched = new Set<string>();
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      monthsTouched.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
    }
    const quotes = await prisma.quoteRequest.findMany({
      where: {
        OR: Array.from(monthsTouched).map((k) => {
          const [y, m] = k.split("-").map(Number);
          return { year: y, month: m };
        }),
        assigneeRaw: { in: Array.from(codeToEmployee.keys()) },
      },
      select: { year: true, month: true, requestDay: true, assigneeRaw: true },
    });
    for (const q of quotes) {
      if (q.requestDay == null || !q.assigneeRaw) continue;
      const qd = new Date(q.year, q.month - 1, q.requestDay);
      if (qd < start || qd >= end) continue;
      const empId = codeToEmployee.get(q.assigneeRaw);
      if (!empId) continue;
      result.get(empId)!.NEW_QUOTE += 1;
    }
  }

  // ---- BUSINESS_TRIP: số ngày có lượt đi đã duyệt (chính + hỗ trợ), mỗi ngày tính 1 buổi ----
  const [primaryTrips, supporterTrips] = await Promise.all([
    prisma.businessTripRequest.findMany({
      where: { status: "APPROVED", visitDate: { gte: start, lt: end }, employeeId: { in: employeeIds } },
      select: { employeeId: true, visitDate: true },
    }),
    prisma.businessTripSupporter.findMany({
      where: { trip: { status: "APPROVED", visitDate: { gte: start, lt: end } }, employeeId: { in: employeeIds } },
      select: { employeeId: true, trip: { select: { visitDate: true } } },
    }),
  ]);
  const dateSetByEmployee = new Map<string, Set<string>>();
  const addDate = (empId: string, date: Date) => {
    if (!dateSetByEmployee.has(empId)) dateSetByEmployee.set(empId, new Set());
    dateSetByEmployee.get(empId)!.add(date.toISOString().slice(0, 10));
  };
  for (const t of primaryTrips) addDate(t.employeeId, t.visitDate);
  for (const t of supporterTrips) addDate(t.employeeId, t.trip.visitDate);
  for (const [empId, dates] of dateSetByEmployee) result.get(empId)!.BUSINESS_TRIP = dates.size;

  return result;
}

// ---------- Báo cáo tiến độ (target vs actual) ----------

export interface WeekPlanMetricCell {
  target: number;
  actual: number;
}

export interface WeekPlanReportRow {
  employeeId: string;
  employeeName: string;
  metrics: Record<WeekPlanMetric, WeekPlanMetricCell>;
  totalTarget: number;
  totalActual: number;
}

export async function getWeekPlanReport(
  weekStartInput: Date,
  onlyEmployeeId?: string
): Promise<{ weekStart: Date; rows: WeekPlanReportRow[] }> {
  const start = startOfWeek(weekStartInput);
  const allEmployees = await getEligibleEmployees();
  const employees = onlyEmployeeId ? allEmployees.filter((e) => e.id === onlyEmployeeId) : allEmployees;
  const employeeIds = employees.map((e) => e.id);

  const [targets, manualCounts, autoMetrics] = await Promise.all([
    employeeIds.length
      ? prisma.weekPlanTarget.findMany({ where: { weekStart: start, employeeId: { in: employeeIds } } })
      : Promise.resolve([]),
    employeeIds.length
      ? prisma.weekPlanResultEntry.groupBy({
          by: ["employeeId", "metric"],
          where: { weekStart: start, employeeId: { in: employeeIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    computeAutoMetrics(start, employees),
  ]);

  const targetMap = new Map(targets.map((t) => [`${t.employeeId}:${t.metric}`, t.targetValue]));
  const manualMap = new Map(manualCounts.map((c) => [`${c.employeeId}:${c.metric}`, c._count._all]));

  const rows: WeekPlanReportRow[] = employees.map((e) => {
    const metrics = {} as Record<WeekPlanMetric, WeekPlanMetricCell>;
    let totalTarget = 0;
    let totalActual = 0;
    for (const m of WEEK_PLAN_METRICS) {
      const target = targetMap.get(`${e.id}:${m}`) ?? 0;
      const actual = isManualMetric(m)
        ? manualMap.get(`${e.id}:${m}`) ?? 0
        : (autoMetrics.get(e.id)?.[m as keyof AutoCounts] ?? 0);
      metrics[m] = { target, actual };
      totalTarget += target;
      totalActual += actual;
    }
    return { employeeId: e.id, employeeName: e.name, metrics, totalTarget, totalActual };
  });

  return { weekStart: start, rows };
}

// ---------- Giao chỉ tiêu (chỉ Quản trị viên) ----------

export async function setWeekPlanTargets(
  weekStartInput: Date,
  createdById: string,
  items: { employeeId: string; metric: WeekPlanMetric; targetValue: number }[]
): Promise<void> {
  const start = startOfWeek(weekStartInput);
  if (items.length === 0) return;
  await prisma.$transaction(
    items.map((it) =>
      prisma.weekPlanTarget.upsert({
        where: {
          employeeId_weekStart_metric: { employeeId: it.employeeId, weekStart: start, metric: it.metric },
        },
        create: {
          employeeId: it.employeeId,
          weekStart: start,
          metric: it.metric,
          targetValue: Math.max(0, Math.round(it.targetValue)),
          createdById,
        },
        update: { targetValue: Math.max(0, Math.round(it.targetValue)), createdById },
      })
    )
  );
}
