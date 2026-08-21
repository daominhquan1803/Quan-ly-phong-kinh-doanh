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
      // Bảng đơn hàng lọc/sắp xếp theo từng cột ở client (mã đơn, khách hàng, NVKD, ngày,
      // giá trị) nên cần thấy toàn bộ danh sách khớp bộ lọc server (trạng thái/nhân
      // viên/quá hạn), không chỉ trang đầu — chặn ở mức rất cao để tránh phình dữ liệu
      // bất thường làm treo trang (xem cùng lý do ở /api/shipping-status/summary).
      take: 2000,
    });

    const filtered = overdueOnly ? orders.filter(isOrderOverdue) : orders;

    return NextResponse.json({ orders: filtered });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("orders GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách đơn hàng" }, { status: 500 });
  }
}
