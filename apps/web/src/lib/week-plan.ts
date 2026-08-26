import { prisma } from "@hoanggia/db";
import { WeekPlanMetric } from "@prisma/client";
import { normalizeVN } from "./text-normalize";

/**
 * Kế hoạch làm việc tuần — theo đúng file mẫu "KẾ HOẠCH LÀM VIỆC TUẦN" anh Quân gửi (bản
 * 26/08, có thêm Trọng số + chấm điểm tuần).
 *
 * 6 đầu mục cố định (WeekPlanMetric):
 *  - 3 mục đầu (NEW_CONTACT/NEW_MEETING/EXISTING_VISIT): NVKD tự ghi lại từng khách hàng đã
 *    liên hệ/gặp (WeekPlanResultEntry) — qua form nhập từng dòng hoặc tải file Excel theo đúng
 *    cấu trúc sheet "KẾT QUẢ" trong file mẫu.
 *  - 3 mục sau: tính TỰ ĐỘNG, không cần nhập tay —
 *      NEW_CUSTOMER_SALE: khách hàng có đơn hàng trong tuần mà CHƯA TỪNG mua hàng trước đó, hoặc
 *        đã dừng mua ít nhất 1 năm tính từ đơn hàng cuối cùng — đối chiếu lịch sử đơn hàng của
 *        khách trên TOÀN CÔNG TY (Order, mọi NVKD từng bán cho khách đó), không giới hạn riêng
 *        NVKD đang xét.
 *      NEW_QUOTE: số báo giá phát sinh trong tuần theo User.quoteAssigneeCode (QuoteRequest).
 *      BUSINESS_TRIP: số NGÀY có lượt đi công tác đã duyệt (chính hoặc hỗ trợ) trong tuần — mỗi
 *        ngày tính 1 buổi dù có nhiều lượt đi cùng ngày.
 *
 * CHỈ TIÊU (targetValue) + TRỌNG SỐ (weight) cho cả 6 mục do Quản trị viên nhập, có thể nhập
 * trước cho tuần tương lai — tổng 6 trọng số của 1 người trong 1 tuần LUÔN phải bằng 100.
 *
 * "Điểm" từng mục = tỉ lệ hoàn thành (thực tế/chỉ tiêu, KHÔNG chặn trần) × trọng số. "Tổng điểm"
 * = tổng 6 "Điểm" đó → quy về "Điểm tuần" 0/1/2 theo bậc thang (80-100 → 2, 60-79 → 1, dưới 60 →
 * 0). "Điểm tuần" của 4 tuần trong 1 tháng được CỘNG DỒN vào cột "Điểm tuần" của KPI tháng
 * (xem getMonthlyWeekPlanScore + apps/web/src/lib/kpi-metrics.ts).
 *
 * ĐỊNH NGHĨA "TUẦN" — CHỈ áp dụng riêng cho mục Kế hoạch làm việc tuần (khác hẳn tuần lịch/ISO
 * dùng ở chỗ khác trong app): mỗi THÁNG luôn được chia thành ĐÚNG 4 tuần, không tuần nào vắt qua
 * 2 tháng — theo đúng ví dụ anh Quân xác nhận (tháng 8/2026): Tuần 1 = 1/8-9/8, Tuần 2 = 10/8-
 * 16/8, Tuần 3 = 17/8-23/8, Tuần 4 = 24/8-31/8. Quy tắc chung: gọi M2/M3/M4 lần lượt là thứ Hai
 * thứ 2/3/4 kể từ đầu tháng (hoặc đầu tháng nếu đầu tháng đã là thứ Hai) — Tuần 1 = [ngày 1
 * tháng, M2 - 1 ngày], Tuần 2 = [M2, M3 - 1], Tuần 3 = [M3, M4 - 1], Tuần 4 = [M4, ngày cuối
 * tháng]. Phần ngày dư ở đầu/cuối tháng (khi tháng không bắt đầu đúng thứ Hai) tự động được gộp
 * vào Tuần 1/Tuần 4 tương ứng — không cần xử lý gì thêm, không tuần nào tham chiếu sang ngày của
 * tháng khác.
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

// Tổng trọng số 6 mục của 1 người/1 tuần luôn phải bằng mốc này.
export const WEEK_PLAN_WEIGHT_TOTAL = 100;

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
    "Tự động — đếm khách hàng có đơn trong tuần mà chưa từng mua hàng trước đó, hoặc đã dừng mua ít nhất 1 năm tính từ đơn hàng cuối cùng (đối chiếu toàn công ty).",
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

// ---------- "Tuần" riêng của Kế hoạch làm việc tuần — luôn đúng 4 tuần/tháng, xem docblock ----------

export interface MonthWeekRange {
  weekIndex: 1 | 2 | 3 | 4;
  start: Date;
  end: Date; // bao gồm cả ngày này (23:59:59 cùng ngày) — dùng exclusive end = end+1 ngày khi query
}

function firstMondayOnOrAfter(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay(); // 0=CN..6=T7
  const diff = day === 1 ? 0 : day === 0 ? 1 : 8 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** 4 tuần của 1 tháng — luôn phủ kín trọn tháng, không tuần nào tham chiếu ngày của tháng khác. */
export function getMonthWeekRanges(year: number, month: number): MonthWeekRange[] {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);
  const m1 = firstMondayOnOrAfter(monthStart);
  const m2 = addDays(m1, 7);
  const m3 = addDays(m1, 14);
  const m4 = addDays(m1, 21);
  return [
    { weekIndex: 1, start: monthStart, end: addDays(m2, -1) },
    { weekIndex: 2, start: m2, end: addDays(m3, -1) },
    { weekIndex: 3, start: m3, end: addDays(m4, -1) },
    { weekIndex: 4, start: m4, end: monthEnd },
  ];
}

/** Tuần (theo định nghĩa riêng ở trên) chứa 1 ngày cụ thể — trả về đúng weekStart để dùng làm
 * khoá lưu WeekPlanTarget/WeekPlanResultEntry. */
export function findMonthWeekForDate(d: Date): MonthWeekRange & { year: number; month: number } {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const ranges = getMonthWeekRanges(year, month);
  const dOnly = new Date(year, d.getMonth(), d.getDate()).getTime();
  const match = ranges.find((r) => dOnly >= r.start.getTime() && dOnly <= r.end.getTime()) ?? ranges[0];
  return { ...match, year, month };
}

/** weekStart bất kỳ (giả định là 1 trong 4 mốc chuẩn của tháng chứa nó) → khoảng ngày đầy đủ,
 * end dùng dạng EXCLUSIVE (đầu ngày hôm sau) để tiện query Prisma `lt`. */
export function weekRange(weekStartInput: Date): { start: Date; end: Date; weekIndex: 1 | 2 | 3 | 4 } {
  const year = weekStartInput.getFullYear();
  const month = weekStartInput.getMonth() + 1;
  const ranges = getMonthWeekRanges(year, month);
  const key = new Date(year, weekStartInput.getMonth(), weekStartInput.getDate()).getTime();
  const match = ranges.find((r) => r.start.getTime() === key) ?? findMonthWeekForDate(weekStartInput);
  return { start: match.start, end: addDays(match.end, 1), weekIndex: match.weekIndex };
}

/** Chuẩn hoá 1 ngày bất kỳ về đúng weekStart của tuần (định nghĩa riêng) chứa nó — dùng khi
 * lưu WeekPlanResultEntry từ 1 ngày cụ thể (entryDate) hoặc khi FE truyền lên 1 ngày trong tuần
 * muốn xem thay vì đúng weekStart. */
export function snapToWeekStart(d: Date): Date {
  return findMonthWeekForDate(d).start;
}

/** Tuần liền trước/sau — có thể nhảy sang tháng khác (Tuần 1 lùi 1 = Tuần 4 tháng trước, Tuần 4
 * tiến 1 = Tuần 1 tháng sau). */
export function adjacentWeekStart(weekStart: Date, direction: 1 | -1): Date {
  const { year, month, weekIndex } = findMonthWeekForDate(weekStart);
  let targetIndex = weekIndex + direction;
  let targetYear = year;
  let targetMonth = month;
  if (targetIndex < 1) {
    targetIndex = 4;
    targetMonth -= 1;
    if (targetMonth < 1) {
      targetMonth = 12;
      targetYear -= 1;
    }
  } else if (targetIndex > 4) {
    targetIndex = 1;
    targetMonth += 1;
    if (targetMonth > 12) {
      targetMonth = 1;
      targetYear += 1;
    }
  }
  const ranges = getMonthWeekRanges(targetYear, targetMonth);
  return ranges[targetIndex - 1].start;
}

function fmtDM(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function formatWeekLabel(weekStart: Date): string {
  const { year, month, weekIndex, start, end } = findMonthWeekForDate(weekStart);
  return `Tuần ${weekIndex} tháng ${month} (${fmtDM(start)} – ${fmtDM(end)}/${year})`;
}

// ---------- Chấm điểm 1 tuần: Tổng điểm (0-100+) → Điểm tuần (0/1/2) ----------

export function weekGradeFromTotalPoints(totalPoints: number): 0 | 1 | 2 {
  if (totalPoints >= 80) return 2;
  if (totalPoints >= 60) return 1;
  return 0;
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

// ---------- Báo cáo tiến độ (target vs actual vs trọng số/điểm) ----------

export interface WeekPlanMetricCell {
  target: number;
  actual: number;
  weight: number;
  point: number; // (actual/target, không chặn trần) × weight
}

export interface WeekPlanReportRow {
  employeeId: string;
  employeeName: string;
  metrics: Record<WeekPlanMetric, WeekPlanMetricCell>;
  totalTarget: number;
  totalActual: number;
  totalWeight: number;
  totalPoints: number; // tổng "Điểm" 6 mục — thang 0-100(+)
  weekGrade: 0 | 1 | 2; // "Điểm tuần" quy đổi từ totalPoints
}

export async function getWeekPlanReport(
  weekStartInput: Date,
  onlyEmployeeId?: string
): Promise<{ weekStart: Date; rows: WeekPlanReportRow[] }> {
  const { start } = weekRange(weekStartInput);
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
  const weightMap = new Map(targets.map((t) => [`${t.employeeId}:${t.metric}`, t.weight]));
  const manualMap = new Map(manualCounts.map((c) => [`${c.employeeId}:${c.metric}`, c._count._all]));

  const rows: WeekPlanReportRow[] = employees.map((e) => {
    const metrics = {} as Record<WeekPlanMetric, WeekPlanMetricCell>;
    let totalTarget = 0;
    let totalActual = 0;
    let totalWeight = 0;
    let totalPoints = 0;
    for (const m of WEEK_PLAN_METRICS) {
      const target = targetMap.get(`${e.id}:${m}`) ?? 0;
      const weight = weightMap.get(`${e.id}:${m}`) ?? 0;
      const actual = isManualMetric(m)
        ? manualMap.get(`${e.id}:${m}`) ?? 0
        : (autoMetrics.get(e.id)?.[m as keyof AutoCounts] ?? 0);
      const point = target > 0 ? (actual / target) * weight : 0;
      metrics[m] = { target, actual, weight, point: Math.round(point * 10) / 10 };
      totalTarget += target;
      totalActual += actual;
      totalWeight += weight;
      totalPoints += point;
    }
    totalPoints = Math.round(totalPoints * 10) / 10;
    return {
      employeeId: e.id,
      employeeName: e.name,
      metrics,
      totalTarget,
      totalActual,
      totalWeight,
      totalPoints,
      weekGrade: weekGradeFromTotalPoints(totalPoints),
    };
  });

  return { weekStart: start, rows };
}

// ---------- Điểm tuần cộng dồn cho KPI tháng ----------

/** Tổng "Điểm tuần" (0/1/2 mỗi tuần) của 4 tuần thuộc đúng tháng này — dùng cho cột "Điểm tuần"
 * của KPI tháng (apps/web/src/lib/kpi-metrics.ts). Luôn duyệt đúng 4 tuần vì "tuần" ở đây định
 * nghĩa theo tháng (xem docblock đầu file), không phụ thuộc số tuần lịch thật của tháng đó. */
export async function getMonthlyWeekPlanScore(employeeId: string, year: number, month: number): Promise<number> {
  const ranges = getMonthWeekRanges(year, month);
  let total = 0;
  for (const r of ranges) {
    const { rows } = await getWeekPlanReport(r.start, employeeId);
    total += rows[0]?.weekGrade ?? 0;
  }
  return total;
}

// ---------- Giao chỉ tiêu + trọng số (chỉ Quản trị viên) ----------

export async function setWeekPlanTargets(
  weekStartInput: Date,
  createdById: string,
  items: { employeeId: string; metric: WeekPlanMetric; targetValue: number; weight: number }[]
): Promise<void> {
  const { start } = weekRange(weekStartInput);
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
          weight: Math.max(0, Math.round(it.weight)),
          createdById,
        },
        update: {
          targetValue: Math.max(0, Math.round(it.targetValue)),
          weight: Math.max(0, Math.round(it.weight)),
          createdById,
        },
      })
    )
  );
}
