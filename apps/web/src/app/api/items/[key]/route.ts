import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Chi tiết từng dòng đơn hàng của 1 mã hàng (key = itemCode, hoặc itemName nếu đơn không có itemCode). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    await requireSession();
    const key = decodeURIComponent((await params).key);

    const lines = await prisma.orderItem.findMany({
      where: { OR: [{ itemCode: key }, { itemCode: null, itemName: key }, { itemCode: "", itemName: key }] },
      include: { order: { select: { orderCode: true, customerName: true, customerCode: true, orderDate: true, status: true } } },
      orderBy: { order: { orderDate: "desc" } },
    });

    return NextResponse.json({
      lines: lines.map((l) => ({
        id: l.id,
        orderCode: l.order.orderCode,
        customerName: l.order.customerName,
        customerCode: l.order.customerCode,
        orderDate: l.order.orderDate,
        status: l.order.status,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        totalPrice: Number(l.totalPrice),
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("items detail GET error", err);
    return NextResponse.json({ error: "Không tải được chi tiết mã hàng" }, { status: 500 });
  }
}
