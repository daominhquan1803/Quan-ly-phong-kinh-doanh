import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { checkSeason, suggestSeasonMonths, type SeasonCheckResult } from "./customer-season";

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
    };
  });
}
