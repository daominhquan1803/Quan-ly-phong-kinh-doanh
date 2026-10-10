import { prisma, getPoAggregates, Prisma } from "@hoanggia/db";
import { monthWeekBuckets } from "@/lib/debt-status";
import { getDebtSnapshot, getCollectionPlan, type DebtOverdueInvoice } from "@/lib/debt-snapshot";
import { getOihAsOf } from "@/lib/dashboard-metrics";
import { asOfDateForPeriod, type ReportPeriod, type ReportType } from "@/lib/report-period";

export const TOTAL_LABEL = "Cả phòng";

export type MetricUnit = "vnd" | "count" | "pct";

export interface ReportMetricDef {
  key: string;
  label: string;
  group: "Doanh số" | "Khách hàng" | "Công nợ" | "Kế hoạch thu";
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
  const [poLines, events, targets, poAgg, customers, oihPast] = await Promise.all([
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
  };
}
