import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { isOrderOverdue } from "@/lib/order-status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const status = searchParams.get("status");
    const overdueOnly = searchParams.get("overdue") === "1";
    const employeeId = searchParams.get("employeeId");

    const where: Prisma.OrderWhereInput = {
      ...scopeByOwner(session, "salesEmployeeId"),
    };
    // Chỉ ADMIN được lọc theo nhân viên bất kỳ — SALES đã bị scopeByOwner giới hạn về
    // chính mình ở trên, không cho phép ghi đè bằng query param.
    if (employeeId && session.user.role === "ADMIN") where.salesEmployeeId = employeeId;
    if (status) where.status = status as Prisma.EnumOrderStatusFilter["equals"];
    if (q) {
      where.OR = [
        { orderCode: { contains: q, mode: "insensitive" } },
        { customerName: { contains: q, mode: "insensitive" } },
        { poCode: { contains: q, mode: "insensitive" } },
      ];
    }

    const orders = await prisma.order.findMany({
      where,
      include: { salesEmployee: { select: { id: true, name: true } } },
      orderBy: { orderDate: "desc" },
      take: 500,
    });

    const filtered = overdueOnly ? orders.filter(isOrderOverdue) : orders;

    return NextResponse.json({ orders: filtered });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("orders GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách đơn hàng" }, { status: 500 });
  }
}
