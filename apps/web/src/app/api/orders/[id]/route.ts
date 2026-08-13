import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        salesEmployee: { select: { id: true, name: true } },
        shipmentSlips: { select: { id: true, slipNumber: true, slipDate: true, status: true, imageThumbPath: true } },
      },
    });
    if (!order) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
    if (session.user.role !== "ADMIN" && order.salesEmployeeId !== session.user.id) {
      throw new ForbiddenError("Không có quyền xem đơn hàng này");
    }
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("orders/[id] GET error", err);
    return NextResponse.json({ error: "Không tải được đơn hàng" }, { status: 500 });
  }
}
