import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { checkSeason, suggestSeasonMonths, type SeasonCheckResult } from "./customer-season";
import { getCustomerRiskReport } from "./customer-risk-query";

const DAY_MS = 86_400_000;
/** Đã có ghi chăm sóc "vẫn mua bình thường" trong ngần này ngày thì không nhắc nguy cơ nữa. */
const SUPPRESS_NORMAL_DAYS = 30;
/** Đã có bất kỳ ghi chăm sóc nào trong ngần này ngày thì chưa nhắc lại. */
const SUPPRESS_ANY_DAYS = 7;

export interface UncaredRisk {
  employeeId: string;
  customerId: string;
  customerCode: string;
  customerName: string;
  level: string;
  silentDays: number;
  medianGapDays: number | null;
  ratio: number | null;
  trendPct: number | null;
  totalValue: number;
}

/** Khách nguy cơ cao/cảnh báo (theo nhịp đặt hàng) mà NVKD chưa chăm sóc gần đây — dùng chung cho nhắc việc và thống kê phòng. */
export async function getUncaredRisks(now: Date = new Date()): Promise<UncaredRisk[]> {
  const report = await getCustomerRiskReport({});
  const customers = await prisma.customer.findMany({
    select: {
      id: true,
      customerCode: true,
      customerName: true,
      careLogs: { orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true, outcome: true } },
    },
  });
  const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c]));
  const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c]));

  const risks: UncaredRisk[] = [];
  for (const r of report.rows) {
    if (!r.employeeId || (r.level !== "HIGH" && r.level !== "MEDIUM")) continue;
    const c = (r.customerCode && byCode.get(normalizeCustomerCode(r.customerCode))) || byName.get(r.customerName.trim().toLowerCase());
    if (!c) continue; // chưa có hồ sơ khách -> chưa ghi chăm sóc được
    const last = c.careLogs[0];
    if (last) {
      const age = (now.getTime() - last.createdAt.getTime()) / DAY_MS;
      if (age < SUPPRESS_ANY_DAYS || (last.outcome === "NORMAL" && age < SUPPRESS_NORMAL_DAYS)) continue;
    }
    risks.push({
      employeeId: r.employeeId,
      customerId: c.id,
      customerCode: c.customerCode,
      customerName: r.customerName,
      level: r.level,
      silentDays: r.silentDays,
      medianGapDays: r.medianGapDays,
      ratio: r.ratio,
      trendPct: r.trendPct,
      totalValue: r.totalValue,
    });
  }
  return risks;
}

export interface CareCustomerRow {
  id: string;
  customerCode: string;
  customerName: string;
  salesEmployee: { id: string; name: string } | null;
  buyingPattern: "REGULAR" | "SEASONAL" | "PROJECT";
  seasonMonths: number[];
  seasonLeadMonths: number;
  suggestedSeasonMonths: number[];
  lastOrderAt: string | null;
  lastCareAt: string | null;
  lastCareOutcome: string | null;
  followUpAt: string | null;
  season: SeasonCheckResult | null;
  /** Có vấn đề (ISSUE) chưa được ghi "Đã xử lý xong" — chỉ khi đó mới hiện lựa chọn RESOLVED. */
  openIssue: boolean;
}

/** Hôm nay theo giờ Việt Nam. */
export function vnToday(now: Date = new Date()): { year: number; month: number; day: number } {
  const t = new Date(now.getTime() + 7 * 3600_000);
  return { year: t.getUTCFullYear(), month: t.getUTCMonth() + 1, day: t.getUTCDate() };
}

/**
 * Ngày đặt hàng (không tính đơn huỷ) của từng khách. Đơn khớp khách theo mã đã chuẩn hoá, không có mã thì theo tên —
 * cùng cách gom với cảnh báo nguy cơ mất khách (customer-risk-query.ts).
 */
export async function loadOrderDates(
  customers: { id: string; customerCode: string; customerName: string }[]
): Promise<Map<string, number[]>> {
  const byCode = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const c of customers) {
    byCode.set(normalizeCustomerCode(c.customerCode), c.id);
    byName.set(c.customerName.trim().toLowerCase(), c.id);
  }
  const orders = await prisma.order.findMany({
    where: { orderDate: { not: null }, status: { not: "CANCELLED" } },
    select: { customerCode: true, customerName: true, orderDate: true },
  });
  const out = new Map<string, number[]>();
  for (const o of orders) {
    const id =
      (o.customerCode && byCode.get(normalizeCustomerCode(o.customerCode))) ||
      byName.get(o.customerName.trim().toLowerCase());
    if (!id || !o.orderDate) continue;
    if (!out.has(id)) out.set(id, []);
    out.get(id)!.push(o.orderDate.getTime());
  }
  return out;
}

/** Lịch sử ghi (mới nhất trước): còn vấn đề mở nếu gặp ISSUE trước khi gặp RESOLVED. */
export function hasOpenIssue(logsDesc: { outcome: string }[]): boolean {
  for (const l of logsDesc) {
    if (l.outcome === "RESOLVED") return false;
    if (l.outcome === "ISSUE") return true;
  }
  return false;
}

/** Tổng hợp cho trang Chăm sóc: mỗi khách kèm lần chăm sóc cuối, hẹn lại, trạng thái vụ. `onlyEmployeeId` = phạm vi SALES. */
export async function getCareOverview(options: { onlyEmployeeId?: string }, now: Date = new Date()): Promise<CareCustomerRow[]> {
  const customers = await prisma.customer.findMany({
    where: options.onlyEmployeeId ? { salesEmployeeId: options.onlyEmployeeId } : {},
    orderBy: { customerName: "asc" },
    include: {
      salesEmployee: { select: { id: true, name: true } },
      careLogs: { orderBy: { createdAt: "desc" }, select: { createdAt: true, outcome: true, followUpAt: true } },
    },
  });
  const orderDates = await loadOrderDates(customers);
  const today = vnToday(now);

  return customers.map((c) => {
    const dates = orderDates.get(c.id) ?? [];
    const cares = c.careLogs;
    const last = cares[0];
    const pendingFollowUp = last?.followUpAt ?? null; // chỉ lần ghi mới nhất: ghi mới hơn nghĩa là lời hẹn cũ đã xử lý
    const season =
      c.buyingPattern === "SEASONAL" && c.seasonMonths.length > 0
        ? checkSeason({
            seasonMonths: c.seasonMonths,
            leadMonths: c.seasonLeadMonths,
            today,
            orderDates: dates,
            careDates: cares.filter((l) => l.outcome !== "NO_CONTACT").map((l) => l.createdAt.getTime()),
          })
        : null;
    return {
      id: c.id,
      customerCode: c.customerCode,
      customerName: c.customerName,
      salesEmployee: c.salesEmployee,
      buyingPattern: c.buyingPattern,
      seasonMonths: c.seasonMonths,
      seasonLeadMonths: c.seasonLeadMonths,
      suggestedSeasonMonths: c.buyingPattern === "REGULAR" ? suggestSeasonMonths(dates) : [],
      lastOrderAt: dates.length ? new Date(Math.max(...dates)).toISOString() : null,
      lastCareAt: last ? last.createdAt.toISOString() : null,
      lastCareOutcome: last ? last.outcome : null,
      followUpAt: pendingFollowUp ? pendingFollowUp.toISOString() : null,
      season,
      openIssue: hasOpenIssue(cares),
    };
  });
}
