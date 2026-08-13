import { NextRequest, NextResponse } from "next/server";
import { prisma, OrderStatus } from "@hoanggia/db";
import { requireSession, requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        salesEmployee: { select: { id: true, name: true } },
        shipmentSlips: { select: { id: true, slipNumber: true, slipDate: true, status: true, imageThumbPath: true } },
        items: { orderBy: { lineOrder: "asc" } },
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

const updateOrderSchema = z.object({
  status: z.nativeEnum(OrderStatus),
});

/**
 * Chỉ dùng để huỷ đơn hàng thủ công (hoặc khôi phục khỏi trạng thái huỷ) ngay trong hệ
 * thống — ví dụ đơn nhập tay/Excel không đồng bộ qua AMIS. Lưu ý: nếu đơn này vẫn đang
 * hoạt động bên AMIS, lần đồng bộ AMIS tiếp theo có thể ghi đè lại trạng thái theo AMIS.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = updateOrderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.order.update({
      where: { id: params.id },
      data: { status: parsed.data.status },
    });

    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("orders/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được đơn hàng" }, { status: 500 });
  }
}
