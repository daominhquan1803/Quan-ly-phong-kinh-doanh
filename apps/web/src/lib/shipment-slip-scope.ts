import { prisma, Prisma } from "@hoanggia/db";

/**
 * Phạm vi xem Phiếu đi hàng (anh Quân chốt 17/10/2026): ADMIN thấy hết; NVKD chỉ thấy phiếu mình phụ trách = phiếu có
 * ít nhất 1 dòng hàng mang Số PO (poSaleNumber) thuộc PO của mình (PoTrackingLine.poCode, NVKD của dòng PO) — cùng cách
 * khớp mà đồng bộ giao hàng đang dùng (xem packages/db/src/po-delivery-sync.ts) — hoặc phiếu do chính mình lập.
 * Phiếu không có số PO nào khớp được NVKD thì chỉ admin thấy.
 */
export async function slipScopeWhere(user: { id: string; role?: string | null }): Promise<Prisma.ShipmentSlipWhereInput> {
  if (user.role === "ADMIN") return {};
  const lines = await prisma.poTrackingLine.findMany({
    where: { salesEmployeeId: user.id },
    distinct: ["poCode"],
    select: { poCode: true },
  });
  const poCodes = lines.map((l) => l.poCode);
  return {
    OR: [{ createdById: user.id }, ...(poCodes.length > 0 ? [{ items: { some: { poSaleNumber: { in: poCodes } } } }] : [])],
  };
}

/** Người dùng có được xem phiếu này không (dùng cho trang/API chi tiết). */
export async function canViewSlip(user: { id: string; role?: string | null }, slipId: string): Promise<boolean> {
  if (user.role === "ADMIN") return true;
  const scope = await slipScopeWhere(user);
  return (await prisma.shipmentSlip.count({ where: { id: slipId, ...scope } })) > 0;
}
