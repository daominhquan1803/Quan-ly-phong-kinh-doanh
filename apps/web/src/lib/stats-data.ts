import { prisma, Prisma } from "@hoanggia/db";
import {
  buildDormantCustomers,
  buildDormantItems,
  normCode,
  payStatus,
  STATS_FROM,
  vnMidnight,
  vnParts,
  type DormantBucket,
  type DormantCustomer,
  type DormantItem,
  type InvoicePayStatus,
  type PoRow,
} from "./stats";
import {
  aggregateLookup,
  monthKeys,
  selectDetail,
  type LookupBy,
  type LookupDelivery,
  type LookupDetailRow,
  type LookupLine,
  type LookupMeta,
  type LookupMetric,
  type LookupRow,
} from "./sales-lookup";

/** Phạm vi người xem: NVKD chỉ thấy khách/hoá đơn của mình; ADMIN thấy tất cả, có thể lọc theo 1 NVKD (employeeId). */
export interface StatsScope {
  isAdmin: boolean;
  userId: string;
  employeeId?: string;
}

const ownerFilterId = (s: StatsScope): string | null => (s.isAdmin ? s.employeeId ?? null : s.userId);

interface CustomerMeta {
  code: string;
  name: string;
  ownerId: string | null;
  inDirectory: boolean;
}

async function loadDirectory(): Promise<Map<string, CustomerMeta>> {
  const customers = await prisma.customer.findMany({
    orderBy: { createdAt: "asc" },
    select: { customerCode: true, customerName: true, salesEmployeeId: true },
  });
  const map = new Map<string, CustomerMeta>();
  for (const c of customers) {
    const k = normCode(c.customerCode);
    // Mã trùng sau chuẩn hoá (vd "ABC" và "C.ABC"): lấy bản ghi tạo sớm nhất.
    if (k && !map.has(k)) map.set(k, { code: c.customerCode, name: c.customerName, ownerId: c.salesEmployeeId, inDirectory: true });
  }
  return map;
}

async function loadPoRows(): Promise<PoRow[]> {
  const lines = await prisma.poTrackingLine.findMany({
    where: { poDate: { gte: STATS_FROM }, customerCode: { not: null } },
    select: {
      customerCode: true,
      poCode: true,
      poDate: true,
      itemCode: true,
      itemName: true,
      unit: true,
      poQuantity: true,
      poValue: true,
      salesEmployeeId: true,
    },
  });
  return lines
    .filter((l) => l.poDate && l.customerCode)
    .map((l) => ({
      customerCode: l.customerCode as string,
      poCode: l.poCode,
      poDate: l.poDate as Date,
      itemCode: l.itemCode,
      itemName: l.itemName,
      unit: l.unit,
      qty: Number(l.poQuantity ?? 0),
      value: Number(l.poValue ?? 0),
      salesEmployeeId: l.salesEmployeeId,
    }));
}

async function userNames(): Promise<Map<string, string>> {
  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

export interface DormantCustomerView extends DormantCustomer {
  code: string;
  name: string;
  ownerName: string;
  inDirectory: boolean;
  poCount: number;
  itemCount: number;
  historyValue: number;
}

export interface DormantItemView extends DormantItem {
  code: string; // mã khách
  name: string; // tên khách
  ownerName: string;
  inDirectory: boolean;
  historyQty: number;
  historyValue: number;
  poCount: number;
}

function resolveMeta(norm: string, rawCode: string, lastOwner: string | null, dir: Map<string, CustomerMeta>, names: Map<string, string>) {
  const m = dir.get(norm);
  const ownerId = m?.ownerId ?? lastOwner;
  return {
    code: m?.code ?? rawCode,
    name: m?.name ?? rawCode, // khách chưa có trong danh sách Khách hàng: tạm lấy mã làm tên
    ownerId,
    ownerName: ownerId ? names.get(ownerId) ?? "" : "",
    inDirectory: !!m,
  };
}

export async function getDormantCustomers(scope: StatsScope, bucket: DormantBucket, ref: Date = new Date()): Promise<DormantCustomerView[]> {
  const [rows, dir, names] = await Promise.all([loadPoRows(), loadDirectory(), userNames()]);
  const filterId = ownerFilterId(scope);
  return buildDormantCustomers(rows, ref, bucket)
    .map((c) => {
      const meta = resolveMeta(c.customerNorm, c.customerCode, c.lastSalesEmployeeId, dir, names);
      return {
        ...c,
        code: meta.code,
        name: meta.name,
        ownerName: meta.ownerName,
        inDirectory: meta.inDirectory,
        _ownerId: meta.ownerId,
        poCount: new Set(c.history.map((h) => h.poCode)).size,
        itemCount: new Set(c.history.map((h) => h.itemCode || h.itemName)).size,
        historyValue: c.history.reduce((s, h) => s + h.value, 0),
      };
    })
    .filter((c) => !filterId || c._ownerId === filterId)
    .map(({ _ownerId, ...rest }) => (void _ownerId, rest));
}

export async function getDormantItems(scope: StatsScope, bucket: DormantBucket, ref: Date = new Date()): Promise<DormantItemView[]> {
  const [rows, dir, names] = await Promise.all([loadPoRows(), loadDirectory(), userNames()]);
  const filterId = ownerFilterId(scope);
  return buildDormantItems(rows, ref, bucket)
    .map((c) => {
      const meta = resolveMeta(c.customerNorm, c.customerCode, c.lastSalesEmployeeId, dir, names);
      return {
        ...c,
        code: meta.code,
        name: meta.name,
        ownerName: meta.ownerName,
        inDirectory: meta.inDirectory,
        _ownerId: meta.ownerId,
        historyQty: c.history.reduce((s, h) => s + h.qty, 0),
        historyValue: c.history.reduce((s, h) => s + h.value, 0),
        poCount: new Set(c.history.map((h) => h.poCode)).size,
      };
    })
    .filter((c) => !filterId || c._ownerId === filterId)
    .map(({ _ownerId, ...rest }) => (void _ownerId, rest));
}

// ---------------- Hoá đơn theo khách ----------------

export interface InvoiceRow {
  invoiceNumber: string;
  invoiceDate: Date | null;
  dueDate: Date | null;
  customerCode: string;
  customerName: string;
  ownerName: string;
  total: number;
  paid: number;
  remaining: number;
  status: InvoicePayStatus;
  lastPaymentDate: Date | null;
}

export interface InvoiceQuery {
  /** Mã khách (đã chuẩn hoá) hoặc "ALL" = mọi khách trong phạm vi. */
  customer: string;
  /** "YYYY-MM" hoặc "ALL". */
  month: string;
}

function invoiceWhere(scope: StatsScope): Prisma.DebtInvoiceWhereInput {
  const id = ownerFilterId(scope);
  return id ? { salesEmployeeId: id } : {};
}

export async function getInvoiceRows(scope: StatsScope, q: InvoiceQuery): Promise<InvoiceRow[]> {
  const where: Prisma.DebtInvoiceWhereInput = invoiceWhere(scope);
  if (q.month !== "ALL") {
    const [y, m] = q.month.split("-").map(Number);
    where.invoiceDate = { gte: vnMidnight(y, m, 1), lt: vnMidnight(y, m + 1, 1) };
  }
  const [invoices, dir] = await Promise.all([
    prisma.debtInvoice.findMany({
      where,
      orderBy: [{ invoiceDate: "asc" }, { invoiceNumber: "asc" }],
      select: {
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        customerCode: true,
        customerName: true,
        originalAmount: true,
        paidAmount: true,
        salesEmployee: { select: { name: true } },
        allocations: { select: { payment: { select: { paymentDate: true } } } },
      },
    }),
    loadDirectory(),
  ]);
  return invoices
    .filter((i) => q.customer === "ALL" || normCode(i.customerCode) === q.customer)
    .map((i) => {
      const total = Number(i.originalAmount);
      const paid = Number(i.paidAmount);
      const dates = i.allocations.map((a) => a.payment.paymentDate).filter((d): d is Date => !!d);
      return {
        invoiceNumber: i.invoiceNumber ?? "",
        invoiceDate: i.invoiceDate,
        dueDate: i.dueDate,
        customerCode: i.customerCode,
        customerName: dir.get(normCode(i.customerCode))?.name ?? i.customerName,
        ownerName: i.salesEmployee?.name ?? "",
        total,
        paid,
        remaining: Math.max(0, total - paid),
        status: payStatus(total, paid),
        lastPaymentDate: dates.length ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null,
      };
    });
}

export interface InvoiceOptions {
  customers: { key: string; code: string; name: string; invoiceCount: number }[];
  months: string[]; // "YYYY-MM", mới -> cũ
}

/** Danh sách khách có hoá đơn (trong phạm vi) + các tháng có hoá đơn — cho ô chọn của trang Thống kê. */
export async function getInvoiceOptions(scope: StatsScope): Promise<InvoiceOptions> {
  const [invoices, dir] = await Promise.all([
    prisma.debtInvoice.findMany({ where: invoiceWhere(scope), select: { customerCode: true, customerName: true, invoiceDate: true } }),
    loadDirectory(),
  ]);
  const byCustomer = new Map<string, { code: string; name: string; invoiceCount: number }>();
  const months = new Set<string>();
  for (const i of invoices) {
    const k = normCode(i.customerCode);
    if (!k) continue;
    const cur = byCustomer.get(k) ?? { code: dir.get(k)?.code ?? i.customerCode, name: dir.get(k)?.name ?? i.customerName, invoiceCount: 0 };
    cur.invoiceCount++;
    byCustomer.set(k, cur);
    if (i.invoiceDate) {
      const p = vnParts(i.invoiceDate);
      months.add(`${p.y}-${String(p.m).padStart(2, "0")}`);
    }
  }
  return {
    customers: Array.from(byCustomer, ([key, v]) => ({ key, ...v })).sort((a, b) => a.name.localeCompare(b.name, "vi")),
    months: Array.from(months).sort().reverse(),
  };
}

// ---------------- Tra cứu doanh số khách / mã hàng theo tháng ----------------

export interface SalesLookupQuery {
  by: LookupBy;
  from: string; // "YYYY-MM"
  to: string; // "YYYY-MM"
}

async function loadSalesSource(from: string, to: string) {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  const start = vnMidnight(fy, fm, 1);
  const end = vnMidnight(ty, tm + 1, 1);
  const [lines, events, dir, names] = await Promise.all([
    prisma.poTrackingLine.findMany({
      where: { poDate: { gte: start, lt: end }, customerCode: { not: null } },
      select: { customerCode: true, poCode: true, poDate: true, itemCode: true, itemName: true, unit: true, poQuantity: true, poValue: true, salesEmployeeId: true },
    }),
    prisma.poDeliveryEvent.findMany({
      where: { eventDate: { gte: start, lt: end }, line: { customerCode: { not: null } } },
      select: {
        eventDate: true,
        quantity: true,
        value: true,
        sourceShipmentSlipId: true,
        salesEmployeeId: true,
        line: { select: { customerCode: true, poCode: true, itemCode: true, itemName: true, unit: true } },
      },
    }),
    loadDirectory(),
    userNames(),
  ]);
  const poLines: LookupLine[] = lines.flatMap((l) =>
    l.poDate && l.customerCode
      ? [{ customerCode: l.customerCode, poCode: l.poCode, poDate: l.poDate, itemCode: l.itemCode, itemName: l.itemName, unit: l.unit, qty: Number(l.poQuantity ?? 0), value: Number(l.poValue ?? 0), salesEmployeeId: l.salesEmployeeId }]
      : []
  );
  const deliveries: LookupDelivery[] = events.flatMap((e) =>
    e.line.customerCode
      ? [{ customerCode: e.line.customerCode, poCode: e.line.poCode, itemCode: e.line.itemCode, itemName: e.line.itemName, unit: e.line.unit, eventDate: e.eventDate, qty: Number(e.quantity), value: Number(e.value), fromSlip: !!e.sourceShipmentSlipId, salesEmployeeId: e.salesEmployeeId }]
      : []
  );
  const metaOf = (customerCode: string, lastOwnerId: string | null): LookupMeta => {
    const m = resolveMeta(normCode(customerCode), customerCode, lastOwnerId, dir, names);
    return { code: m.code, name: m.name, ownerId: m.ownerId, ownerName: m.ownerName };
  };
  return { poLines, deliveries, metaOf };
}

/** Bảng doanh số khách (hoặc mã hàng) × tháng. NVKD chỉ thấy khách của mình; ADMIN thấy tất cả và lọc theo NVKD. */
export async function getSalesLookup(scope: StatsScope, q: SalesLookupQuery): Promise<{ months: string[]; rows: LookupRow[] }> {
  const months = monthKeys(q.from, q.to);
  if (months.length === 0) return { months, rows: [] };
  const { poLines, deliveries, metaOf } = await loadSalesSource(q.from, q.to);
  return { months, rows: aggregateLookup(q.by, months, poLines, deliveries, metaOf, ownerFilterId(scope)) };
}

/** Chi tiết 1 ô của bảng: các dòng PO (đơn hàng) hoặc đợt giao (đi hàng) của khách/mã hàng trong 1 tháng. */
export async function getSalesDetail(
  scope: StatsScope,
  q: { by: LookupBy; key: string; month: string; metric: LookupMetric }
): Promise<LookupDetailRow[]> {
  const { poLines, deliveries, metaOf } = await loadSalesSource(q.month, q.month);
  return selectDetail(q.by, q.key, q.month, q.metric, poLines, deliveries, metaOf, ownerFilterId(scope));
}
