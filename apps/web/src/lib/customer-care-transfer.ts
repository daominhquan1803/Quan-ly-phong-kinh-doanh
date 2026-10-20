import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { loadCarePlan, type Tier } from "./customer-care-plan";

/**
 * Chuyển hàng loạt khách đang đứng tên người quản trị (anh Quân 20/10/2026: chuyển bớt khách của anh cho NVKD).
 * Doanh số theo đơn (Order.salesEmployeeId) KHÔNG đổi — chỉ đổi người phụ trách hồ sơ khách (lịch chăm sóc, nhắc việc).
 */
const DAY = 86_400_000;

export interface OwnedCustomerRow {
  id: string;
  customerCode: string;
  customerName: string;
  orders12: number;
  value12: number;
  lastOrderAt: string | null;
  tier: Tier | null; // null = không có đơn 12 tháng / khách theo vụ-dự án (không vào lịch)
  pattern: "REGULAR" | "SEASONAL" | "PROJECT";
  unpaidDebt: number; // công nợ còn lại của khách (đang đứng tên người chuyển)
}

export async function getOwnedCustomers(ownerId: string, now: Date = new Date()): Promise<OwnedCustomerRow[]> {
  const since = new Date(now.getTime() - 365 * DAY);
  const [customers, orders, plan, invoices] = await Promise.all([
    prisma.customer.findMany({
      where: { salesEmployeeId: ownerId },
      select: { id: true, customerCode: true, customerName: true, buyingPattern: true },
      orderBy: { customerName: "asc" },
    }),
    prisma.order.findMany({
      where: { orderDate: { gte: since }, status: { not: "CANCELLED" } },
      select: { customerCode: true, customerName: true, orderDate: true, totalValue: true },
    }),
    loadCarePlan({ onlyEmployeeId: ownerId }, now),
    prisma.debtInvoice.findMany({
      where: { salesEmployeeId: ownerId },
      select: { customerCode: true, originalAmount: true, paidAmount: true },
    }),
  ]);
  const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c.id]));
  const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c.id]));
  const agg = new Map<string, { n: number; v: number; last: number }>();
  for (const o of orders) {
    const id = (o.customerCode && byCode.get(normalizeCustomerCode(o.customerCode))) || byName.get(o.customerName.trim().toLowerCase());
    if (!id) continue;
    const a = agg.get(id) ?? { n: 0, v: 0, last: 0 };
    a.n++;
    a.v += Number(o.totalValue);
    if (o.orderDate) a.last = Math.max(a.last, o.orderDate.getTime());
    agg.set(id, a);
  }
  const debt = new Map<string, number>();
  for (const i of invoices) {
    const id = byCode.get(normalizeCustomerCode(i.customerCode));
    if (!id) continue;
    debt.set(id, (debt.get(id) ?? 0) + Math.max(0, Number(i.originalAmount) - Number(i.paidAmount)));
  }
  const tiers = new Map(plan.customers.map((c) => [c.id, c.tier]));
  return customers
    .map((c) => {
      const a = agg.get(c.id);
      return {
        id: c.id,
        customerCode: c.customerCode,
        customerName: c.customerName,
        orders12: a?.n ?? 0,
        value12: a?.v ?? 0,
        lastOrderAt: a?.last ? new Date(a.last).toISOString() : null,
        tier: tiers.get(c.id) ?? null,
        pattern: c.buyingPattern,
        unpaidDebt: debt.get(c.id) ?? 0,
      };
    })
    .sort((a, b) => b.value12 - a.value12 || a.customerName.localeCompare(b.customerName, "vi"));
}
