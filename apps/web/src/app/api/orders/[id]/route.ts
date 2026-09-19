import { NextRequest, NextResponse } from "next/server";
import { prisma, OrderStatus, Prisma } from "@hoanggia/db";
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
  status: z.nativeEnum(OrderStatus).optional(),
  customerName: z.string().trim().min(1, "Tên khách hàng không được để trống").optional(),
  customerCode: z.string().trim().nullable().optional(),
  poCode: z.string().trim().nullable().optional(),
  totalValue: z.number().min(0).optional(),
  // yyyy-mm-dd (ô <input type="date">) hoặc null để xoá ngày.
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  expectedDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

/** App lưu ngày dạng "nửa đêm giờ Việt Nam" — không dùng new Date("yyyy-mm-dd") (ra nửa đêm UTC, lệch 7 tiếng). */
function vnMidnight(s: string | null): Date | null {
  return s ? new Date(`${s}T00:00:00+07:00`) : null;
}

/**
 * Huỷ / khôi phục đơn (mọi đơn) hoặc sửa thông tin đơn (chỉ đơn nhập tay/Excel — đơn đồng bộ
 * AMIS sẽ bị worker ghi đè lại nên không cho sửa thông tin ở đây).
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const parsed = updateOrderSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const d = parsed.data;

    const data: Prisma.OrderUpdateInput = {};
    if (d.status !== undefined) data.status = d.status;
    if (d.customerName !== undefined) data.customerName = d.customerName;
    if (d.customerCode !== undefined) data.customerCode = d.customerCode || null;
    if (d.poCode !== undefined) data.poCode = d.poCode || null;
    if (d.totalValue !== undefined) data.totalValue = d.totalValue;
    if (d.orderDate !== undefined) data.orderDate = vnMidnight(d.orderDate);
    if (d.expectedDeliveryDate !== undefined) data.expectedDeliveryDate = vnMidnight(d.expectedDeliveryDate);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Không có dữ liệu cập nhật" }, { status: 400 });
    }

    const existing = await prisma.order.findUnique({ where: { id: params.id }, select: { source: true } });
    if (!existing) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
    const editsInfo = Object.keys(data).some((k) => k !== "status");
    if (editsInfo && existing.source === "AMIS_API") {
      return NextResponse.json(
        { error: "Đơn đồng bộ từ AMIS — sửa bên AMIS, không sửa thông tin tại đây." },
        { status: 400 }
      );
    }

    const order = await prisma.order.update({ where: { id: params.id }, data });

    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("orders/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được đơn hàng" }, { status: 500 });
  }
}
