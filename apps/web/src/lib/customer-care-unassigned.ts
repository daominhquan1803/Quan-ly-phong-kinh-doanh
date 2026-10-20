import { prisma, normalizeCustomerCode } from "@hoanggia/db";

/**
 * Khách chưa có người phụ trách (anh Quân chốt 20/10/2026: "khách không thuộc ai quản lý thì để anh phân cho các bạn"):
 *  (1) hồ sơ khách (customers) chưa gán NVKD;
 *  (2) khách có đơn 12 tháng qua nhưng CHƯA có hồ sơ khách — chưa ghi chăm sóc được; tạo hồ sơ + gán ngay khi anh phân.
 * Gợi ý người nhận = NVKD đứng tên nhiều đơn của khách nhất trong 12 tháng.
 */
const DAY = 86_400_000;

export interface UnassignedRow {
  /** id hồ sơ khách (loại 1) hoặc null (loại 2 — chưa có hồ sơ) */
  customerId: string | null;
  customerCode: string | null;
  customerName: string;
  orders12: number;
  value12: number;
  lastOrderAt: string | null;
  suggestedEmployeeId: string | null;
  suggestedEmployeeName: string | null;
}

export async function getUnassignedCustomers(now: Date = new Date()): Promise<UnassignedRow[]> {
  const since = new Date(now.getTime() - 365 * DAY);
  const [customers, orders] = await Promise.all([
    prisma.customer.findMany({ select: { id: true, customerCode: true, customerName: true, salesEmployeeId: true } }),
    prisma.order.findMany({
      where: { orderDate: { gte: since }, status: { not: "CANCELLED" } },
      select: { customerCode: true, customerName: true, orderDate: true, totalValue: true, salesEmployeeId: true, salesEmployee: { select: { name: true } } },
    }),
  ]);
  const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c]));
  const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c]));

  interface Agg { customerId: string | null; code: string | null; name: string; orders: number; value: number; last: number; byEmp: Map<string, { n: number; name: string }> }
  const groups = new Map<string, Agg>();
  for (const o of orders) {
    const c = (o.customerCode && byCode.get(normalizeCustomerCode(o.customerCode))) || byName.get(o.customerName.trim().toLowerCase()) || null;
    if (c?.salesEmployeeId) continue; // đã có người phụ trách
    const key = c ? `c:${c.id}` : `n:${(o.customerCode ? normalizeCustomerCode(o.customerCode) : "") || o.customerName.trim().toLowerCase()}`;
    const g =
      groups.get(key) ??
      groups
        .set(key, { customerId: c?.id ?? null, code: c?.customerCode ?? (o.customerCode ? normalizeCustomerCode(o.customerCode) : null), name: c?.customerName ?? o.customerName.trim(), orders: 0, value: 0, last: 0, byEmp: new Map() })
        .get(key)!;
    g.orders++;
    g.value += Number(o.totalValue);
    if (o.orderDate) g.last = Math.max(g.last, o.orderDate.getTime());
    if (o.salesEmployeeId) {
      const e = g.byEmp.get(o.salesEmployeeId) ?? { n: 0, name: o.salesEmployee?.name ?? "" };
      e.n++;
      g.byEmp.set(o.salesEmployeeId, e);
    }
  }
  // hồ sơ chưa gán nhưng không có đơn 12 tháng vẫn liệt kê (để anh gán), xếp cuối
  for (const c of customers) {
    if (c.salesEmployeeId || groups.has(`c:${c.id}`)) continue;
    groups.set(`c:${c.id}`, { customerId: c.id, code: c.customerCode, name: c.customerName, orders: 0, value: 0, last: 0, byEmp: new Map() });
  }

  return [...groups.values()]
    .map((g) => {
      const top = [...g.byEmp.entries()].sort((a, b) => b[1].n - a[1].n)[0];
      return {
        customerId: g.customerId,
        customerCode: g.code,
        customerName: g.name,
        orders12: g.orders,
        value12: g.value,
        lastOrderAt: g.last ? new Date(g.last).toISOString() : null,
        suggestedEmployeeId: top?.[0] ?? null,
        suggestedEmployeeName: top?.[1].name ?? null,
      };
    })
    .sort((a, b) => b.value12 - a.value12);
}
