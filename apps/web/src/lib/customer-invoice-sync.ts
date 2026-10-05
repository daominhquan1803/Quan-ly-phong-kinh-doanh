import { prisma } from "@hoanggia/db";

/**
 * Gán NVKD phụ trách của khách cho các hoá đơn công nợ của khách đó còn TRỐNG NVKD (hoá đơn up
 * lên trước khi khách tồn tại / chưa gán NVKD). Chỉ điền chỗ trống — KHÔNG ghi đè hoá đơn đã gán
 * NVKD (kể cả gán tay khác với NVKD của khách). Trả về số hoá đơn được gán.
 */
export async function assignCustomerToUnassignedInvoices(
  customerCode: string,
  salesEmployeeId: string | null | undefined,
): Promise<number> {
  if (!salesEmployeeId) return 0;
  const res = await prisma.debtInvoice.updateMany({
    where: { customerCode, salesEmployeeId: null },
    data: { salesEmployeeId },
  });
  return res.count;
}
