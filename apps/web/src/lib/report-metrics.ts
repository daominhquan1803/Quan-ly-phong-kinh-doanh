import { prisma, getPoAggregates, Prisma } from "@hoanggia/db";
import { monthWeekBuckets } from "@/lib/debt-status";
import { getDebtSnapshot, getCollectionPlan, type DebtOverdueInvoice } from "@/lib/debt-snapshot";
import { getOihAsOf } from "@/lib/dashboard-metrics";
import { COUNTED_STOP_WHERE, COUNTED_TRIP_WHERE } from "@/lib/business-trip-report";
import { asOfDateForPeriod, type ReportPeriod, type ReportType } from "@/lib/report-period";

export const TOTAL_LABEL = "Cả phòng";

export type MetricUnit = "vnd" | "count" | "pct";

export interface ReportMetricDef {
  key: string;
  label: string;
  group: "Doanh số" | "Khách hàng" | "Công tác" | "Công nợ" | "Kế hoạch thu";
  unit: MetricUnit;
  /** true = có số của cả 3 kỳ để so sánh; false = chỉ kỳ hiện tại (OIH, công nợ chốt cuối kỳ...). */
  multi: boolean;
  monthOnly?: boolean;
  /** Chỉ có dòng "Cả phòng" (số toàn công ty, không gắn được NVKD). */
  companyOnly?: boolean;
}

export const REPORT_METRICS: ReportMetricDef[] = [
  { key: "po_value", label: "Doanh số đơn hàng", group: "Doanh số", unit: "vnd", multi: true },
  { key: "delivered", label: "Doanh số đi hàng", group: "Doanh số", unit: "vnd", multi: true },
  { key: "po_sx", label: "Doanh số đơn hàng sản xuất", group: "Doanh số", unit: "vnd", multi: true },
  { key: "delivered_sx", label: "Doanh số đi hàng sản xuất", group: "Doanh số", unit: "vnd", multi: true },
  { key: "oih", label: "OIH (hàng chưa giao, cuối kỳ)", group: "Doanh số", unit: "vnd", multi: false },
  { key: "target", label: "Chỉ tiêu doanh số tháng", group: "Doanh số", unit: "vnd", multi: true, monthOnly: true },
  { key: "completion", label: "Hoàn thành chỉ tiêu (%)", group: "Doanh số", unit: "pct", multi: true, monthOnly: true },
  { key: "new_customers", label: "Khách hàng mới (số khách)", group: "Khách hàng", unit: "count", multi: true },
  { key: "trip_days", label: "Số buổi đi công tác đã duyệt", group: "Công tác", unit: "count", multi: true },
  { key: "trip_visits", label: "Số khách đã gặp (báo cáo đã duyệt)", group: "Công tác", unit: "count", multi: true },
  { key: "trip_pending_review", label: "Báo cáo công tác chờ duyệt (chưa tính điểm)", group: "Công tác", unit: "count", multi: false },
  { key: "trip_steps_overdue", label: "Việc tiếp theo sau buổi gặp trễ hạn", group: "Công tác", unit: "count", multi: false },
  { key: "debt_total", label: "Tổng công nợ", group: "Công nợ", unit: "vnd", multi: false },
  { key: "debt_overdue", label: "Công nợ quá hạn", group: "Công nợ", unit: "vnd", multi: false },
  { key: "debt_overdue_rate", label: "Tỉ lệ nợ quá hạn (%)", group: "Công nợ", unit: "pct", multi: false },
  { key: "debt_bad", label: "Nợ xấu (>180 ngày)", group: "Công nợ", unit: "vnd", multi: false },
  { key: "debt_nodue", label: "Nợ chưa có hạn thanh toán", group: "Công nợ", unit: "vnd", multi: false },
  { key: "debt_open_count", label: "Số hoá đơn còn nợ", group: "Công nợ", unit: "count", multi: false },
  { key: "debt_noschedule_count", label: "Số HĐ chưa có lịch thanh toán", group: "Công nợ", unit: "count", multi: false },
  { key: "debt_noschedule_amount", label: "Còn nợ HĐ chưa có lịch thanh toán", group: "Công nợ", unit: "vnd", multi: false },
  { key: "plan_planned", label: "Kế hoạch thu trong kỳ", group: "Kế hoạch thu", unit: "vnd", multi: false },
  { key: "plan_collected", label: "Đã thu trong kỳ (tiền về khớp hoá đơn)", group: "Kế hoạch thu", unit: "vnd", multi: false },
  { key: "plan_rate", label: "Tỉ lệ đạt kế hoạch thu (%)", group: "Kế hoạch thu", unit: "pct", multi: false },
  { key: "total_received", label: "Tổng tiền về trong kỳ (cả công ty)", group: "Kế hoạch thu", unit: "vnd", multi: false, companyOnly: true },
];

export interface ReportRow {
  employee: string;
  metricKey: string;
  /** [kỳ hiện tại, kỳ -1, kỳ -2]; null = không có/không áp dụng. */
  values: (number | null)[];
}

export interface ReportNewCustomer {
  customerCode: string;
  customerName: string;
  employee: string;
  createdAt: Date;
}

/** Doanh số đi hàng so với KPI (chỉ tiêu doanh số tháng). Báo cáo tháng: cả tháng; báo cáo tuần: luỹ kế tháng chứa cuối tuần, tới hết tuần. */
export interface ReportKpi {
  /** vd "Tháng 10/2026" hoặc "Luỹ kế tháng 10/2026 (01/10–18/10)". */
  periodLabel: string;
  /** Dòng đầu là "Cả phòng" nếu người xem thấy cả phòng; các dòng sau theo tên nhân viên. */
  rows: { employee: string; delivered: number; target: number }[];
}

export interface ReportData {
  type: ReportType;
  periods: ReportPeriod[];
  generatedAt: Date;
  /** Mốc chốt công nợ (null = số hiện tại). */
  asOf: Date | null;
  metrics: ReportMetricDef[];
  employeeNames: string[];
  /** null nếu người xem chỉ thấy dữ liệu của chính mình. */
  totalLabel: string | null;
  rows: ReportRow[];
  newCustomers: ReportNewCustomer[];
  overdueInvoices: DebtOverdueInvoice[];
  plan: {
    bucketLabels: string[];
    rows: { employee: string; planned: number[]; collected: number[] }[];
  };
  kpi: ReportKpi;
}

const isProductionCode = (code: string | null) => {
  const c = (code ?? "").toUpperCase();
  return c.startsWith("SI") || c.startsWith("SB");
};
const pad = (n: number) => String(n).padStart(2, "0");
const dm = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const ratePct = (num: number, den: number) => (den > 0 ? (num / den) * 100 : null);

/**
 * Gom số liệu báo cáo tuần/tháng. Dùng đúng định nghĩa của các trang hiện có (xem dashboard-metrics.ts,
 * debt-snapshot.ts) để số khớp: Doanh số đi hàng = PoDeliveryEvent trong kỳ; Doanh số đơn hàng =
 * G.Trị PO theo ngày đặt PO; "sản xuất" = mã hàng bắt đầu SI/SB (dòng không có mã hàng không phân
 * loại được); OIH = PO đang mở (kỳ đã kết thúc: tính ngược về cuối kỳ; kỳ đang chạy: tại lúc xuất file). `scopeEmployeeId` = chỉ lấy dữ liệu của 1 người
 * (NVKD) — khi đó không có dòng "Cả phòng".
 */
export async function getReportData(opts: {
  type: ReportType;
  periods: ReportPeriod[];
  scopeEmployeeId?: string;
  now?: Date;
}): Promise<ReportData> {
  const { type, periods, scopeEmployeeId } = opts;
  const now = opts.now ?? new Date();
  const current = periods[0];
  const rangeStart = periods[periods.length - 1].start;
  const rangeEnd = current.end;
  const metrics = REPORT_METRICS.filter((m) => !(m.monthOnly && type !== "month"));
  const periodIdx = (d: Date) => periods.findIndex((p) => d >= p.start && d < p.end);

  // Cùng tập nhân viên với trang Tổng quan (có mã AMIS, tính vào thống kê bán hàng); người xem chỉ thấy
  // dữ liệu của mình thì lấy đúng chính họ.
  const employees = await prisma.user.findMany({
    where: scopeEmployeeId
      ? { id: scopeEmployeeId }
      : { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const empIds = employees.map((e) => e.id);
  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  // Kỳ đã kết thúc -> OIH tính ngược về cuối kỳ; kỳ đang chạy -> số hiện tại.
  const oihAsOfEnd = now >= current.end;
  const todayStartVN = new Date(`${new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`);
  const [poLines, events, targets, poAgg, customers, oihPast, primaryTrips, supporterTrips, pendingReviewTrips, overdueSteps] = await Promise.all([
    prisma.poTrackingLine.findMany({
      where: { poDate: { gte: rangeStart, lt: rangeEnd }, salesEmployeeId: { in: empIds } },
      select: { salesEmployeeId: true, itemCode: true, poValue: true, poDate: true },
    }),
    prisma.poDeliveryEvent.findMany({
      where: { eventDate: { gte: rangeStart, lt: rangeEnd }, salesEmployeeId: { in: empIds } },
      select: { salesEmployeeId: true, value: true, eventDate: true, line: { select: { itemCode: true } } },
    }),
    type === "month"
      ? prisma.salesTarget.findMany({
          where: { employeeId: { in: empIds }, OR: periods.map((p) => ({ year: p.start.getFullYear(), month: p.start.getMonth() + 1 })) },
        })
      : Promise.resolve([]),
    oihAsOfEnd ? Promise.resolve([]) : getPoAggregates(scopeEmployeeId ? { salesEmployeeId: scopeEmployeeId } : {}),
    prisma.customer.findMany({
      where: { createdAt: { gte: rangeStart, lt: rangeEnd }, ...(scopeEmployeeId ? { salesEmployeeId: scopeEmployeeId } : {}) },
      select: { customerCode: true, customerName: true, createdAt: true, salesEmployeeId: true, salesEmployee: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
    oihAsOfEnd ? getOihAsOf(current.end, scopeEmployeeId) : Promise.resolve(new Map<string, number>()),
    // Công tác: chỉ tính buổi đã duyệt + khách đã gặp (xem lib/business-trip-report.ts); chính + người đi hỗ trợ.
    prisma.businessTripRequest.findMany({
      where: { ...COUNTED_TRIP_WHERE, visitDate: { gte: rangeStart, lt: rangeEnd }, employeeId: { in: empIds } },
      select: { employeeId: true, visitDate: true, stops: { where: COUNTED_STOP_WHERE, select: { id: true } } },
    }),
    prisma.businessTripSupporter.findMany({
      where: { trip: { ...COUNTED_TRIP_WHERE, visitDate: { gte: rangeStart, lt: rangeEnd } }, employeeId: { in: empIds } },
      select: { employeeId: true, trip: { select: { visitDate: true, stops: { where: COUNTED_STOP_WHERE, select: { id: true } } } } },
    }),
    // Số tại lúc xuất file (không tính ngược quá khứ được).
    prisma.businessTripRequest.findMany({ where: { status: "REPORTED", employeeId: { in: empIds } }, select: { employeeId: true } }),
    prisma.businessTripStop.findMany({
      where: {
        nextAction: { not: null },
        nextActionDoneAt: null,
        nextActionDue: { lt: todayStartVN },
        outcome: { in: ["MET", "RESCHEDULED"] },
        trip: { status: { in: ["REPORTED", "APPROVED"] } },
        nextActionOwnerId: { in: empIds },
      },
      select: { nextActionOwnerId: true },
    }),
  ]);

  // ---- Gom số theo (nhân viên, chỉ số, kỳ) ----
  const acc = new Map<string, number[]>(); // `${empId}|${metricKey}` -> [kỳ0, kỳ-1, kỳ-2]
  const add = (empId: string, key: string, i: number, v: number) => {
    const k = `${empId}|${key}`;
    const arr = acc.get(k) ?? periods.map(() => 0);
    arr[i] += v;
    acc.set(k, arr);
  };
  for (const l of poLines) {
    const i = l.poDate ? periodIdx(l.poDate) : -1;
    if (i < 0 || !l.salesEmployeeId) continue;
    const v = Number(l.poValue);
    add(l.salesEmployeeId, "po_value", i, v);
    if (isProductionCode(l.itemCode)) add(l.salesEmployeeId, "po_sx", i, v);
  }
  for (const ev of events) {
    const i = periodIdx(ev.eventDate);
    if (i < 0 || !ev.salesEmployeeId) continue;
    const v = Number(ev.value);
    add(ev.salesEmployeeId, "delivered", i, v);
    if (isProductionCode(ev.line.itemCode)) add(ev.salesEmployeeId, "delivered_sx", i, v);
  }
  for (const t of targets) {
    const i = periods.findIndex((p) => p.start.getFullYear() === t.year && p.start.getMonth() + 1 === t.month);
    if (i >= 0) add(t.employeeId, "target", i, Number(t.targetRevenue));
  }
  // Công tác: số buổi = số NGÀY có buổi đi đã duyệt (gộp nhiều lượt cùng ngày), số khách = tổng khách đã gặp.
  const tripDaySets = new Map<string, Set<string>>(); // `${empId}|${i}` -> các ngày
  const addTrip = (empId: string, visitDate: Date, visits: number) => {
    const i = periodIdx(visitDate);
    if (i < 0) return;
    const k = `${empId}|${i}`;
    if (!tripDaySets.has(k)) tripDaySets.set(k, new Set());
    tripDaySets.get(k)!.add(visitDate.toISOString().slice(0, 10));
    add(empId, "trip_visits", i, visits);
  };
  for (const t of primaryTrips) addTrip(t.employeeId, t.visitDate, t.stops.length);
  for (const t of supporterTrips) addTrip(t.employeeId, t.trip.visitDate, t.trip.stops.length);
  for (const [k, days] of tripDaySets) {
    const [empId, i] = k.split("|");
    add(empId, "trip_days", Number(i), days.size);
  }
  const countBy = (ids: (string | null)[]) => {
    const m = new Map<string, number>();
    for (const id of ids) if (id) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };
  const pendingReviewBy = countBy(pendingReviewTrips.map((t) => t.employeeId));
  const stepsOverdueBy = countBy(overdueSteps.map((t) => t.nextActionOwnerId));
  const sumMap = (m: Map<string, number>) => empIds.reduce((a, id) => a + (m.get(id) ?? 0), 0);

  const oih = new Map<string, number>(oihPast);
  for (const p of poAgg) {
    if (!p.isOpen || !p.salesEmployeeId) continue;
    oih.set(p.salesEmployeeId, (oih.get(p.salesEmployeeId) ?? 0) + p.remainingValue);
  }
  const newCustomersAll = periods.map(() => 0);
  const newCustomerList: ReportNewCustomer[] = [];
  for (const c of customers) {
    const i = periodIdx(c.createdAt);
    if (i < 0) continue;
    newCustomersAll[i]++;
    if (c.salesEmployeeId && empIds.includes(c.salesEmployeeId)) add(c.salesEmployeeId, "new_customers", i, 1);
    if (i === 0) {
      newCustomerList.push({
        customerCode: c.customerCode,
        customerName: c.customerName,
        employee: c.salesEmployee?.name ?? "(Chưa gán)",
        createdAt: c.createdAt,
      });
    }
  }

  // ---- Công nợ + kế hoạch thu (chốt cuối kỳ) ----
  const asOf = asOfDateForPeriod(current, now);
  const debtWhere: Prisma.DebtInvoiceWhereInput = scopeEmployeeId ? { salesEmployeeId: scopeEmployeeId } : {};
  const snap = await getDebtSnapshot({ where: debtWhere, asOfDate: asOf, withOverdueInvoices: true });

  const planBuckets =
    type === "month"
      ? monthWeekBuckets(current.start.getFullYear(), current.start.getMonth() + 1).map((b) => ({
          label: `Tuần ${b.weekIndex} (${dm(b.start)}–${dm(b.end)})`,
          start: b.start,
          end: new Date(b.end.getFullYear(), b.end.getMonth(), b.end.getDate() + 1),
        }))
      : [{ label: current.label, start: current.start, end: current.end }];
  const planMap = await getCollectionPlan(debtWhere, planBuckets);
  const sumArr = (a: number[]) => a.reduce((s, x) => s + x, 0);
  const zeroPlan = () => ({ planned: planBuckets.map(() => 0), collected: planBuckets.map(() => 0) });

  const receivedAgg = scopeEmployeeId
    ? null
    : await prisma.debtPayment.aggregate({
        where: { paymentDate: { gte: current.start, lt: current.end }, matchStatus: { not: "IGNORED" } },
        _sum: { amount: true },
      });

  // ---- Dựng dòng phẳng: nhân viên × chỉ số ----
  const rows: ReportRow[] = [];
  const pushRow = (employee: string, key: string, values: (number | null)[]) => {
    const def = metrics.find((m) => m.key === key);
    if (!def) return;
    rows.push({ employee, metricKey: key, values: def.multi ? values : [values[0], null, null] });
  };
  const nullable = (arr: number[] | undefined) => (arr ?? periods.map(() => 0)).map((v) => v as number | null);

  const emit = (label: string, empId: string | null) => {
    const get = (key: string) =>
      empId
        ? nullable(acc.get(`${empId}|${key}`))
        : periods.map((_, i) => empIds.reduce((s, id) => s + (acc.get(`${id}|${key}`)?.[i] ?? 0), 0) as number | null);
    for (const key of ["po_value", "delivered", "po_sx", "delivered_sx"]) pushRow(label, key, get(key));
    pushRow(label, "oih", [empId ? oih.get(empId) ?? 0 : Array.from(oih.entries()).filter(([id]) => empIds.includes(id)).reduce((s, [, v]) => s + v, 0)]);
    const target = get("target");
    const delivered = get("delivered");
    pushRow(label, "target", target);
    pushRow(label, "completion", target.map((t, i) => ratePct(delivered[i] ?? 0, t ?? 0)));
    pushRow(label, "new_customers", empId ? get("new_customers") : newCustomersAll.map((v) => v as number | null));
    pushRow(label, "trip_days", get("trip_days"));
    pushRow(label, "trip_visits", get("trip_visits"));
    pushRow(label, "trip_pending_review", [empId ? pendingReviewBy.get(empId) ?? 0 : sumMap(pendingReviewBy)]);
    pushRow(label, "trip_steps_overdue", [empId ? stepsOverdueBy.get(empId) ?? 0 : sumMap(stepsOverdueBy)]);

    const d = empId
      ? snap.perEmployee.get(empId)
      : {
          totalDebt: snap.totalDebt,
          overdueDebt: snap.overdueDebt,
          badDebt: snap.badDebt,
          noDueDebt: snap.noDueDebt,
          invoiceCount: snap.openInvoiceCount,
          noScheduleCount: snap.noScheduleCount,
          noScheduleAmount: snap.noScheduleAmount,
        };
    const z = d ?? { totalDebt: 0, overdueDebt: 0, badDebt: 0, noDueDebt: 0, invoiceCount: 0, noScheduleCount: 0, noScheduleAmount: 0 };
    pushRow(label, "debt_total", [z.totalDebt]);
    pushRow(label, "debt_overdue", [z.overdueDebt]);
    pushRow(label, "debt_overdue_rate", [ratePct(z.overdueDebt, z.totalDebt)]);
    pushRow(label, "debt_bad", [z.badDebt]);
    pushRow(label, "debt_nodue", [z.noDueDebt]);
    pushRow(label, "debt_open_count", [z.invoiceCount]);
    pushRow(label, "debt_noschedule_count", [z.noScheduleCount]);
    pushRow(label, "debt_noschedule_amount", [z.noScheduleAmount]);

    const plan = empId
      ? planMap.get(empId) ?? zeroPlan()
      : Array.from(planMap.values()).reduce(
          (a, p) => ({
            planned: a.planned.map((x, i) => x + p.planned[i]),
            collected: a.collected.map((x, i) => x + p.collected[i]),
          }),
          zeroPlan()
        );
    pushRow(label, "plan_planned", [sumArr(plan.planned)]);
    pushRow(label, "plan_collected", [sumArr(plan.collected)]);
    pushRow(label, "plan_rate", [ratePct(sumArr(plan.collected), sumArr(plan.planned))]);
    if (!empId) pushRow(label, "total_received", [Number(receivedAgg?._sum.amount ?? 0)]);
    return plan;
  };

  const planRows: ReportData["plan"]["rows"] = [];
  const totalLabel = scopeEmployeeId ? null : TOTAL_LABEL;
  if (totalLabel) planRows.push({ employee: totalLabel, ...emit(totalLabel, null) });
  for (const e of employees) planRows.push({ employee: e.name, ...emit(nameById.get(e.id)!, e.id) });

  // ---- Doanh số đi hàng so với KPI ----
  // Tháng: dùng luôn số đã gom ở trên. Tuần: KPI là chỉ tiêu THÁNG nên so luỹ kế tháng (chứa ngày cuối tuần) tới hết tuần.
  const deliveredBy = new Map<string, number>();
  const targetBy = new Map<string, number>();
  let kpiLabel: string;
  if (type === "month") {
    for (const id of empIds) {
      deliveredBy.set(id, acc.get(`${id}|delivered`)?.[0] ?? 0);
      targetBy.set(id, acc.get(`${id}|target`)?.[0] ?? 0);
    }
    kpiLabel = `Tháng ${current.label}`;
  } else {
    const lastDay = new Date(current.end.getFullYear(), current.end.getMonth(), current.end.getDate() - 1);
    const monthStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    const monthEnd = new Date(lastDay.getFullYear(), lastDay.getMonth() + 1, 1);
    const upto = current.end < monthEnd ? current.end : monthEnd;
    const [mtdEvents, monthTargets] = await Promise.all([
      prisma.poDeliveryEvent.findMany({
        where: { eventDate: { gte: monthStart, lt: upto }, salesEmployeeId: { in: empIds } },
        select: { salesEmployeeId: true, value: true, eventDate: true },
      }),
      prisma.salesTarget.findMany({ where: { employeeId: { in: empIds }, year: monthStart.getFullYear(), month: monthStart.getMonth() + 1 } }),
    ]);
    for (const ev of mtdEvents) {
      if (!ev.salesEmployeeId || ev.eventDate < monthStart || ev.eventDate >= upto) continue;
      deliveredBy.set(ev.salesEmployeeId, (deliveredBy.get(ev.salesEmployeeId) ?? 0) + Number(ev.value));
    }
    for (const t of monthTargets) targetBy.set(t.employeeId, Number(t.targetRevenue));
    const lastShown = new Date(upto.getFullYear(), upto.getMonth(), upto.getDate() - 1);
    kpiLabel = `Luỹ kế tháng ${pad(monthStart.getMonth() + 1)}/${monthStart.getFullYear()} (${dm(monthStart)}–${dm(lastShown)})`;
  }
  const sumOver = (m: Map<string, number>) => empIds.reduce((s, id) => s + (m.get(id) ?? 0), 0);
  const kpiRows: ReportKpi["rows"] = [
    ...(totalLabel ? [{ employee: totalLabel, delivered: sumOver(deliveredBy), target: sumOver(targetBy) }] : []),
    ...employees.map((e) => ({ employee: e.name, delivered: deliveredBy.get(e.id) ?? 0, target: targetBy.get(e.id) ?? 0 })),
  ];

  return {
    type,
    periods,
    generatedAt: now,
    asOf,
    metrics,
    employeeNames: employees.map((e) => e.name),
    totalLabel,
    rows,
    newCustomers: newCustomerList,
    overdueInvoices: snap.overdueInvoices,
    plan: { bucketLabels: planBuckets.map((b) => b.label), rows: planRows },
    kpi: { periodLabel: kpiLabel, rows: kpiRows },
  };
}
