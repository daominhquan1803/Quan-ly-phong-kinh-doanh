import { NextResponse } from "next/server";
import { prisma, OrderStatus } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { isOrderOverdue, isUpcomingDeadline, daysUntilDeadline } from "@/lib/order-status";

export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_DAYS = 3;
const RATE_WINDOW_DAYS = 90; // tính tỷ lệ giao đúng hạn dựa trên đơn có hạn giao trong 90 ngày qua
const MAX_ROWS = 200; // giới hạn số dòng trả về cho bảng — tổng số liệu (KPI) vẫn tính trên toàn bộ

export async function GET() {
  try {
    const session = await requireSession();
    const scope = scopeByOwner(session, "salesEmployeeId");

    const openOrders = await prisma.order.findMany({
      where: {
        status: { notIn: [OrderStatus.CANCELLED] },
        expectedDeliveryDate: { not: null },
        ...scope,
      },
      include: { salesEmployee: { select: { id: true, name: true } } },
      orderBy: { expectedDeliveryDate: "asc" },
    });

    const overdue = openOrders.filter(isOrderOverdue);
    const upcoming = openOrders.filter((o) => isUpcomingDeadline(o, UPCOMING_WINDOW_DAYS));

    const rateCutoff = new Date();
    rateCutoff.setDate(rateCutoff.getDate() - RATE_WINDOW_DAYS);
    const dueInWindow = openOrders.filter(
      (o) => o.expectedDeliveryDate && new Date(o.expectedDeliveryDate) >= rateCutoff && new Date(o.expectedDeliveryDate) <= new Date()
    );
    const deliveredInWindow = dueInWindow.filter((o) => o.status === OrderStatus.DELIVERED).length;
    const onTimeRatePct = dueInWindow.length > 0 ? Math.round((deliveredInWindow / dueInWindow.length) * 100) : null;

    const overdueValue = overdue.reduce((s, o) => s + Number(o.totalValue), 0);

    // Thống kê theo nhân viên — chỉ có ý nghĩa khi xem toàn đội (ADMIN).
    const byEmployeeMap = new Map<
      string,
      { employeeId: string; employeeName: string; openCount: number; overdueCount: number; upcomingCount: number }
    >();
    for (const o of openOrders) {
      if (!o.salesEmployee) continue;
      const key = o.salesEmployee.id;
      if (!byEmployeeMap.has(key)) {
        byEmployeeMap.set(key, {
          employeeId: key,
          employeeName: o.salesEmployee.name,
          openCount: 0,
          overdueCount: 0,
          upcomingCount: 0,
        });
      }
      const row = byEmployeeMap.get(key)!;
      row.openCount++;
      if (isOrderOverdue(o)) row.overdueCount++;
      if (isUpcomingDeadline(o, UPCOMING_WINDOW_DAYS)) row.upcomingCount++;
    }

    const toRow = (o: (typeof openOrders)[number]) => ({
      id: o.id,
      orderCode: o.orderCode,
      customerName: o.customerName,
      salesEmployeeName: o.salesEmployee?.name ?? o.salesEmployeeNameRaw,
      expectedDeliveryDate: o.expectedDeliveryDate,
      totalValue: o.totalValue.toString(),
      daysUntilDeadline: daysUntilDeadline(o.expectedDeliveryDate),
      status: o.status,
    });

    return NextResponse.json({
      openCount: openOrders.length,
      overdueCount: overdue.length,
      overdueValue,
      upcomingCount: upcoming.length,
      upcomingWindowDays: UPCOMING_WINDOW_DAYS,
      onTimeRatePct,
      rateWindowDays: RATE_WINDOW_DAYS,
      byEmployee: Array.from(byEmployeeMap.values()).sort((a, b) => b.overdueCount - a.overdueCount),
      // Quá hạn: đã sắp xếp hạn giao tăng dần từ trước (openOrders) nên phần tử đầu là
      // quá hạn lâu nhất — ưu tiên hiển thị trước, cắt bớt nếu danh sách quá dài.
      overdueOrders: overdue.slice(0, MAX_ROWS).map(toRow),
      overdueOrdersTruncated: overdue.length > MAX_ROWS,
      upcomingOrders: upcoming.slice(0, MAX_ROWS).map(toRow),
      upcomingOrdersTruncated: upcoming.length > MAX_ROWS,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipping-status/summary GET error", err);
    return NextResponse.json({ error: "Không tải được tình hình giao hàng" }, { status: 500 });
  }
}
