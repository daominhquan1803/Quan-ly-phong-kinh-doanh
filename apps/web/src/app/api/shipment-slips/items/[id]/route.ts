import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma, applyShipmentSlipDeliveries } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  poSaleNumber: z.string().trim().min(1).max(60).optional(),
  itemCode: z.string().trim().min(1).max(60).optional(),
  // true = "Không cần PO" (hàng bù hao/tặng/đổi lỗi), false = đưa lại vào bảng cần sửa.
  ignored: z.boolean().optional(),
});

/**
 * Admin sửa nhanh 1 dòng phiếu đi hàng từ bảng "Dòng phiếu cần sửa": gán Số PO / sửa mã hàng cho đúng PO, hoặc đánh dấu "Không cần PO".
 * Sau khi sửa khớp lại đợt giao của CHÍNH phiếu đó với Tiến độ giao hàng (xoá + tạo lại, không tính trùng).
 * Lưu ý: nhập lại Excel cùng số phiếu sẽ thay toàn bộ dòng hàng → sửa ở đây bị ghi đè nếu file Excel chưa có PO/mã đúng.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { poSaleNumber, itemCode, ignored } = parsed.data;

    const item = await prisma.shipmentSlipItem.findUnique({ where: { id: params.id }, select: { id: true, shipmentSlipId: true } });
    if (!item) return NextResponse.json({ error: "Không tìm thấy dòng phiếu" }, { status: 404 });

    await prisma.shipmentSlipItem.update({
      where: { id: item.id },
      data: { ...(poSaleNumber ? { poSaleNumber } : {}), ...(itemCode ? { itemCode } : {}), ...(ignored != null ? { issueIgnored: ignored } : {}) },
    });

    const slip = await prisma.shipmentSlip.findUniqueOrThrow({
      where: { id: item.shipmentSlipId },
      select: { id: true, slipDate: true, items: { select: { itemCode: true, itemName: true, poSaleNumber: true, qtyActual: true } } },
    });
    const result = await applyShipmentSlipDeliveries(
      slip.id,
      slip.slipDate,
      slip.items.map((i) => ({ ...i, qtyActual: i.qtyActual != null ? Number(i.qtyActual) : null }))
    );
    return NextResponse.json({ ok: true, unmatchedItems: result.unmatchedItems });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipment-slips/items/[id] PATCH error", err);
    return NextResponse.json({ error: "Không sửa được dòng phiếu" }, { status: 500 });
  }
}
