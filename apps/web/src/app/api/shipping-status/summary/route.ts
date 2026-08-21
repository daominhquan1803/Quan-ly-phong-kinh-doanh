import { NextRequest, NextResponse } from "next/server";
import { prisma, OrderStatus } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { isOrderOverdue, isUpcomingDeadline, daysUntilDeadline } from "@/lib/order-status";

export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_DAYS = 3;
const RATE_WINDOW_DAYS = 90; // tính tỷ lệ giao đúng hạn dựa trên đơn có hạn giao trong 90 ngày qua
// Trả nguyên danh sách (không cắt bớt) để bảng có tìm kiếm/sắp xếp ở client tìm được đúng
// mọi đơn — quy mô thực tế (vài trăm đơn quá hạn) vẫn nhẹ để render, chỉ chặn ở mức rất cao
// để tránh trường hợp bất thường dữ liệu phình to đột biến làm treo trang.
const MAX_ROWS = 2000;

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const scope = scopeByOwner(session, "salesEmployeeId");
    const employeeId = req.nextUrl.searchParams.get("employeeId");

    const openOrders = await prisma.order.findMany({
      where: {
        status: { notIn: [OrderStatus.CANCELLED] },
        expectedDeliveryDate: { not: null },
        ...scope,
        // Chỉ ADMIN được lọc theo nhân viên bất kỳ — SALES đã bị scopeByOwner giới hạn.
        ...(employeeId && session.user.role === "ADMIN" ? { salesEmployeeId: employeeId } : {}),
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
    // "Đúng hạn" = có ngày giao thực tế (actualDeliveryDate, đồng bộ từ field delivery_date
    // của AMIS) và ngày đó không muộn hơn hạn giao — chính xác hơn hẳn so với suy đoán qua
    // trạng thái. Đơn chưa có actualDeliveryDate (đồng bộ trước khi có field này, hoặc nhập
    // tay/Excel) thì tạm coi trạng thái "Đã giao" là đúng hạn, giữ hành vi cũ để không làm
    // tụt tỷ lệ do thiếu dữ liệu lịch sử.
    const onTimeInWindow = dueInWindow.filter((o) => {
      if (o.actualDeliveryDate && o.expectedDeliveryDate) {
        return new Date(o.actualDeliveryDate) <= new Date(o.expectedDeliveryDate);
      }
      return o.status === OrderStatus.DELIVERED;
    }).length;
    const onTimeRatePct = dueInWindow.length > 0 ? Math.round((onTimeInWindow / dueInWindow.length) * 100) : null;

    // Giá trị còn lại CHƯA giao = tổng đơn - đã giao (deliveredValue, đồng bộ từ
    // total_amount_delivered_summary của AMIS) — đơn giao 1 phần chỉ tính đúng phần còn nợ,
    // không tính cả giá trị đơn (đơn nhập tay/Excel chưa có deliveredValue thì mặc định 0,
    // tức toàn bộ giá trị đơn coi như chưa giao — đúng thực tế vì chưa có gì đối chiếu).
    const remainingValue = (o: (typeof openOrders)[number]) =>
      Math.max(Number(o.totalValue) - Number(o.deliveredValue), 0);
    const overdueValue = overdue.reduce((s, o) => s + remainingValue(o), 0);

    // Thống kê theo nhân viên — chỉ có ý nghĩa khi xem toàn đội (ADMIN). "Giá trị đã giao"
    // cộng dồn field deliveredValue (đồng bộ từ AMIS); "Giá trị chưa giao" = remainingValue —
    // cả 2 tính trên mọi đơn trong phạm vi đang mở (kể cả phần đã giao của đơn giao 1 phần,
    // không chỉ đơn đã giao xong 100%).
    const byEmployeeMap = new Map<
      string,
      {
        employeeId: string;
        employeeName: string;
        openCount: number;
        overdueCount: number;
        upcomingCount: number;
        deliveredValue: number;
        undeliveredValue: number;
      }
    >();
    let totalDeliveredValue = 0;
    let totalUndeliveredValue = 0;
    for (const o of openOrders) {
      const delivered = Number(o.deliveredValue);
      const undelivered = remainingValue(o);
      totalDeliveredValue += delivered;
      totalUndeliveredValue += undelivered;

      if (!o.salesEmployee) continue;
      const key = o.salesEmployee.id;
      if (!byEmployeeMap.has(key)) {
        byEmployeeMap.set(key, {
          employeeId: key,
          employeeName: o.salesEmployee.name,
          openCount: 0,
          overdueCount: 0,
          upcomingCount: 0,
          deliveredValue: 0,
          undeliveredValue: 0,
        });
      }
      const row = byEmployeeMap.get(key)!;
      row.openCount++;
      row.deliveredValue += delivered;
      row.undeliveredValue += undelivered;
      if (isOrderOverdue(o)) row.overdueCount++;
      if (isUpcomingDeadline(o, UPCOMING_WINDOW_DAYS)) row.upcomingCount++;
    }

    const toRow = (o: (typeof openOrders)[number]) => ({
      id: o.id,
      orderCode: o.orderCode,
      customerName: o.customerName,
      salesEmployeeName: o.salesEmployee?.name ?? o.salesEmployeeNameRaw,
      expectedDeliveryDate: o.expectedDeliveryDate,
      // Giá trị còn lại chưa giao — không phải tổng giá trị đơn (xem remainingValue ở trên).
      remainingValue: remainingValue(o).toString(),
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
      totalDeliveredValue,
      totalUndeliveredValue,
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
