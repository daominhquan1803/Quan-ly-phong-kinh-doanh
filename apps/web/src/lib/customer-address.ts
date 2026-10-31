import { prisma } from "@hoanggia/db";
import { normalizeCustomerCode } from "./debt-customer-match";

/**
 * Địa chỉ hiệu lực của khách: địa chỉ NVKD đã nhập trong hồ sơ, không có thì lấy địa chỉ (thanh toán/giao hàng) trên đơn AMIS gần nhất —
 * cùng nguồn với báo cáo hồ sơ khách (customer-report.ts). Đơn khớp khách theo mã đã chuẩn hoá, không có thì theo tên.
 */
export async function effectiveAddresses(
  customers: { id: string; customerCode: string; customerName: string; address: string | null }[]
): Promise<Map<string, string>> {
  const byCode = new Map(customers.map((c) => [normalizeCustomerCode(c.customerCode), c.id]));
  const byName = new Map(customers.map((c) => [c.customerName.trim().toLowerCase(), c.id]));
  const rows = await prisma.$queryRaw<{ code: string | null; name: string; addr: string | null }[]>`
    SELECT DISTINCT ON (coalesce("customerCode", "customerName")) "customerCode" code, "customerName" name,
      coalesce(nullif("rawData"->>'billing_address', ''), nullif("rawData"->>'shipping_address', '')) addr
    FROM orders WHERE source = 'AMIS_API' AND coalesce(nullif("rawData"->>'billing_address', ''), nullif("rawData"->>'shipping_address', '')) IS NOT NULL
    ORDER BY coalesce("customerCode", "customerName"), "orderDate" DESC NULLS LAST`;
  const fromOrders = new Map<string, string>();
  for (const r of rows) {
    const id = (r.code && byCode.get(normalizeCustomerCode(r.code))) || byName.get(r.name.trim().toLowerCase());
    if (id && r.addr && !fromOrders.has(id)) fromOrders.set(id, r.addr);
  }
  const out = new Map<string, string>();
  for (const c of customers) {
    const a = c.address?.trim() || fromOrders.get(c.id);
    if (a) out.set(c.id, a);
  }
  return out;
}
