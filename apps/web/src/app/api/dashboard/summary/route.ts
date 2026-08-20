import { NextResponse } from "next/server";
import { prisma, OrderStatus } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { getEmployeeTargetVsActual, getProductGroupTargetVsActual } from "@/lib/dashboard-metrics";
import { isOrderOverdue } from "@/lib/order-status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const perEmployee = await getEmployeeTargetVsActual(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    const totalTarget = perEmployee.reduce((s, r) => s + r.targetRevenue, 0);
    const totalActual = perEmployee.reduce((s, r) => s + r.actualRevenue, 0);
    const completionPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null;

    const byProductGroup = await getProductGroupTargetVsActual(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    // So sánh với tháng trước để hiện xu hướng tăng/giảm ở các thẻ KPI — chỉ tính khi có
    // dữ liệu thật của tháng trước, không suy đoán.
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevPerEmployee = await getEmployeeTargetVsActual(
      prevYear,
      prevMonth,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );
    const prevTotalTarget = prevPerEmployee.reduce((s, r) => s + r.targetRevenue, 0);
    const prevTotalActual = prevPerEmployee.reduce((s, r) => s + r.actualRevenue, 0);
    const prevCompletionPct = prevTotalTarget > 0 ? Math.round((prevTotalActual / prevTotalTarget) * 100) : null;

    const actualTrendPct = prevTotalActual > 0 ? Math.round(((totalActual - prevTotalActual) / prevTotalActual) * 100) : null;
    const completionTrendPts = completionPct != null && prevCompletionPct != null ? completionPct - prevCompletionPct : null;

    const openOrders = await prisma.order.findMany({
      where: {
        status: { notIn: [OrderStatus.DELIVERED, OrderStatus.CANCELLED] },
        expectedDeliveryDate: { not: null },
        ...scopeByOwner(session, "salesEmployeeId"),
      },
      include: { salesEmployee: { select: { name: true } } },
      orderBy: { expectedDeliveryDate: "asc" },
      take: 500,
    });
    const overdueOrders = openOrders.filter(isOrderOverdue).slice(0, 20);

    // Công nợ là số liệu tổng của cả phòng (không gắn được theo từng nhân viên) — chỉ
    // ADMIN mới thấy, đúng yêu cầu "chỉ Quản trị viên xem được thông tin tổng của cả phòng".
    const isAdmin = session.user.role === "ADMIN";
    let debtTotal: number | null = null;
    let debtOverdue: number | null = null;
    let debtSnapshotDate: Date | null = null;
    let debtTrendPct: number | null = null;
    if (isAdmin) {
      const latestDebt = await prisma.debtSnapshot.findFirst({ orderBy: { snapshotDate: "desc" } });
      if (latestDebt) {
        const rows = await prisma.debtSnapshot.findMany({ where: { snapshotDate: latestDebt.snapshotDate } });
        debtTotal = rows.reduce((s, r) => s + Number(r.totalDebt), 0);
        debtOverdue = rows.reduce((s, r) => s + Number(r.overdueDebt), 0);
        debtSnapshotDate = latestDebt.snapshotDate;

        // So với lần đồng bộ công nợ liền trước (nếu có) — số liệu thật từ SyncLog, không suy đoán.
        const prevSnapshot = await prisma.debtSnapshot.findFirst({
          where: { snapshotDate: { lt: latestDebt.snapshotDate } },
          orderBy: { snapshotDate: "desc" },
        });
        if (prevSnapshot) {
          const prevRows = await prisma.debtSnapshot.findMany({ where: { snapshotDate: prevSnapshot.snapshotDate } });
          const prevOverdue = prevRows.reduce((s, r) => s + Number(r.overdueDebt), 0);
          debtTrendPct =
            prevOverdue > 0 ? Math.round(((debtOverdue - prevOverdue) / prevOverdue) * 100) : debtOverdue > 0 ? 100 : 0;
        }
      } else {
        debtTotal = 0;
        debtOverdue = 0;
      }
    }

    return NextResponse.json({
      year,
      month,
      totalTarget,
      totalActual,
      completionPct,
      actualTrendPct,
      completionTrendPts,
      perEmployee,
      byProductGroup,
      overdueOrderCount: overdueOrders.length,
      overdueOrders: overdueOrders.map((o) => ({
        id: o.id,
        orderCode: o.orderCode,
        customerName: o.customerName,
        salesEmployeeName: o.salesEmployee?.name ?? o.salesEmployeeNameRaw,
        expectedDeliveryDate: o.expectedDeliveryDate,
      })),
      debtTotal,
      debtOverdue,
      debtSnapshotDate,
      debtTrendPct,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("dashboard/summary GET error", err);
    return NextResponse.json({ error: "Không tải được dữ liệu tổng quan" }, { status: 500 });
  }
}
