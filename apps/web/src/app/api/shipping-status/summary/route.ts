import { NextRequest, NextResponse } from "next/server";
import { prisma, getPoAggregates, type PoAggregate } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { daysUntilDeadline } from "@/lib/order-status";

export const dynamic = "force-dynamic";

const UPCOMING_WINDOW_DAYS = 3;
const RATE_WINDOW_DAYS = 90; // tính tỷ lệ giao đúng hạn dựa trên PO có hạn giao trong 90 ngày qua
const DAILY_WINDOW_DAYS = 7; // thống kê giao hàng hàng ngày — chỉ hiện 7 ngày gần nhất
// Trả nguyên danh sách (không cắt bớt) để bảng có tìm kiếm/sắp xếp ở client tìm được đúng mọi
// PO — quy mô thực tế (vài trăm PO quá hạn) vẫn nhẹ để render, chỉ chặn ở mức rất cao để tránh
// trường hợp bất thường dữ liệu phình to đột biến làm treo trang.
const MAX_ROWS = 2000;

type PoAgg = PoAggregate;

/**
 * Tiến độ giao hàng — NGUỒN DỮ LIỆU ĐỘC LẬP VỚI AMIS: từ PoTrackingLine/PoDeliveryEvent (bơm
 * từ AMIS + Phiếu đi hàng, xem po-tracking-from-orders.ts), KHÔNG dùng bảng Order đồng bộ AMIS
 * trực tiếp (trang "Đơn hàng" vẫn hiển thị Order như cũ, đây là 2 nguồn tách biệt). "Đơn" ở
 * trang này = 1 PO (gộp mọi dòng hàng cùng Số PO, xem getPoAggregates — dùng CHUNG với widget
 * "Đơn hàng quá hạn" ở Tổng quan để 2 nơi luôn khớp số liệu).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const scope = scopeByOwner(session, "salesEmployeeId");
    const employeeId = req.nextUrl.searchParams.get("employeeId");

    const allPos = await getPoAggregates({
      ...scope,
      // Chỉ ADMIN được lọc theo nhân viên bất kỳ — SALES đã bị scopeByOwner giới hạn.
      ...(employeeId && session.user.role === "ADMIN" ? { salesEmployeeId: employeeId } : {}),
    });
    const openPos = allPos.filter((p) => p.isOpen);

    const isPoOverdue = (p: PoAgg) => {
      if (!p.isOpen || !p.earliestOpenDeadline) return false;
      const days = daysUntilDeadline(p.earliestOpenDeadline);
      return days != null && days < 0;
    };
    const isPoUpcoming = (p: PoAgg) => {
      if (!p.isOpen || !p.earliestOpenDeadline) return false;
      const days = daysUntilDeadline(p.earliestOpenDeadline);
      return days != null && days >= 0 && days <= UPCOMING_WINDOW_DAYS;
    };

    const overdue = openPos.filter(isPoOverdue);
    const upcoming = openPos.filter(isPoUpcoming);
    const overdueValue = overdue.reduce((s, p) => s + p.remainingValue, 0);

    // Tỷ lệ giao đúng hạn: trong các PO đã "Kết thúc" có hạn giao (lấy hạn muộn nhất trong các
    // dòng, vì hạn thường đồng nhất theo PO) rơi trong 90 ngày qua, bao nhiêu % có đợt giao GẦN
    // NHẤT không muộn hơn hạn. PO đã đóng nhưng không có đợt giao nào ghi nhận (dữ liệu thiếu)
    // bị loại khỏi mẫu tính, không suy đoán.
    const rateCutoff = new Date();
    rateCutoff.setDate(rateCutoff.getDate() - RATE_WINDOW_DAYS);
    const now = new Date();
    const closedPos = allPos.filter((p) => !p.isOpen);
    const dueInWindow = closedPos.filter(
      (p) => p.latestDeadlineAll && p.latestDeadlineAll >= rateCutoff && p.latestDeadlineAll <= now && p.latestDeliveryDate
    );
    const onTimeInWindow = dueInWindow.filter((p) => p.latestDeliveryDate! <= p.latestDeadlineAll!).length;
    const onTimeRatePct = dueInWindow.length > 0 ? Math.round((onTimeInWindow / dueInWindow.length) * 100) : null;

    // "Giá trị đã giao (tháng)" và tổng theo nhân viên lấy CHUNG 1 nguồn với Tổng quan/Kế
    // hoạch kinh doanh (PoDeliveryEvent theo eventDate trong tháng) — đảm bảo số liệu khớp
    // tuyệt đối giữa các trang, không còn lệch như khi 1 bên tính theo ngày đặt, 1 bên tính
    // theo ngày giao của AMIS.
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const reportMonthLabel = `${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const deliveredByEmployee = await prisma.poDeliveryEvent.groupBy({
      by: ["salesEmployeeId"],
      where: {
        eventDate: { gte: monthStart, lt: monthEnd },
        salesEmployeeId: { not: null },
        ...(employeeId && session.user.role === "ADMIN" ? { salesEmployeeId: employeeId } : {}),
        ...(session.user.role !== "ADMIN" ? { salesEmployeeId: session.user.id } : {}),
      },
      _sum: { value: true },
    });
    const deliveredMap = new Map(deliveredByEmployee.map((r) => [r.salesEmployeeId as string, Number(r._sum.value ?? 0)]));

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
    for (const p of openPos) {
      if (!p.salesEmployeeId) continue;
      const key = p.salesEmployeeId;
      if (!byEmployeeMap.has(key)) {
        byEmployeeMap.set(key, {
          employeeId: key,
          employeeName: p.salesEmployeeName,
          openCount: 0,
          overdueCount: 0,
          upcomingCount: 0,
          deliveredValue: deliveredMap.get(key) ?? 0,
          undeliveredValue: 0,
        });
      }
      const row = byEmployeeMap.get(key)!;
      row.openCount++;
      row.undeliveredValue += p.remainingValue;
      if (isPoOverdue(p)) row.overdueCount++;
      if (isPoUpcoming(p)) row.upcomingCount++;
    }
    // Nhân viên có doanh số đã giao trong tháng nhưng không có PO nào đang mở (vd đã giao hết)
    // vẫn cần xuất hiện trong bảng — bổ sung các trường hợp còn thiếu.
    for (const [empId, delivered] of deliveredMap) {
      if (!byEmployeeMap.has(empId)) {
        const name = allPos.find((p) => p.salesEmployeeId === empId)?.salesEmployeeName ?? "—";
        byEmployeeMap.set(empId, {
          employeeId: empId,
          employeeName: name,
          openCount: 0,
          overdueCount: 0,
          upcomingCount: 0,
          deliveredValue: delivered,
          undeliveredValue: 0,
        });
      }
    }
    const totalDeliveredValue = Array.from(byEmployeeMap.values()).reduce((s, r) => s + r.deliveredValue, 0);
    const totalUndeliveredValue = openPos.reduce((s, p) => s + p.remainingValue, 0);

    // Thống kê giao hàng theo ngày — 7 ngày gần nhất (kể cả hôm nay), lấy từ đúng nguồn
    // PoDeliveryEvent như "Giá trị đã giao" ở trên, chỉ khác là gộp theo NGÀY thay vì THÁNG.
    const dailyStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAILY_WINDOW_DAYS - 1));
    const dailyEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dailyEvents = await prisma.poDeliveryEvent.findMany({
      where: {
        eventDate: { gte: dailyStart, lt: dailyEnd },
        salesEmployeeId: { not: null },
        ...(employeeId && session.user.role === "ADMIN" ? { salesEmployeeId: employeeId } : {}),
        ...(session.user.role !== "ADMIN" ? { salesEmployeeId: session.user.id } : {}),
      },
      select: { eventDate: true, salesEmployeeId: true, value: true },
    });

    const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dayBuckets = new Map<string, { date: string; total: number; byEmployee: Record<string, number> }>();
    for (let i = 0; i < DAILY_WINDOW_DAYS; i++) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAILY_WINDOW_DAYS - 1) + i);
      dayBuckets.set(dayKey(d), { date: dayKey(d), total: 0, byEmployee: {} });
    }
    const dailyEmployeeIds = new Set<string>(byEmployeeMap.keys());
    for (const ev of dailyEvents) {
      const empId = ev.salesEmployeeId;
      if (!empId) continue;
      dailyEmployeeIds.add(empId);
      const bucket = dayBuckets.get(dayKey(new Date(ev.eventDate)));
      if (!bucket) continue; // ngoài khoảng 7 ngày do lệch múi giờ biên ngày — bỏ qua, không đáng kể
      const value = Number(ev.value);
      bucket.total += value;
      bucket.byEmployee[empId] = (bucket.byEmployee[empId] ?? 0) + value;
    }
    // Không lấy tên nhân viên trực tiếp từ byEmployeeMap vì có thể thiếu người chỉ có giao
    // hàng trong 7 ngày qua nhưng không có PO đang mở/doanh số tháng này (hiếm nhưng có thể).
    const dailyEmployees = await prisma.user.findMany({
      where: { id: { in: Array.from(dailyEmployeeIds) } },
      select: { id: true, name: true },
    });

    // Đơn đã đóng thủ công (nút "Kết thúc đơn") gần đây — để anh xem lại/bấm "Mở lại đơn" nếu
    // bấm nhầm. Đơn đã đóng thủ công không còn nằm trong openPos nên sẽ biến mất khỏi các bảng
    // Quá hạn/Sắp đến hạn ở trên — danh sách này là nơi duy nhất còn thấy lại được các đơn đó.
    const manuallyClosedOrders = allPos
      .filter((p) => p.manuallyClosedAt)
      .sort((a, b) => (b.manuallyClosedAt?.getTime() ?? 0) - (a.manuallyClosedAt?.getTime() ?? 0))
      .slice(0, 50)
      .map((p) => ({
        poCode: p.poCode,
        customerName: p.customerCode ?? "—",
        salesEmployeeName: p.salesEmployeeName,
        manuallyClosedAt: p.manuallyClosedAt,
        manuallyClosedByName: p.manuallyClosedByName,
      }));

    const toRow = (p: PoAgg) => ({
      id: p.poCode,
      orderCode: p.poCode,
      customerName: p.customerCode ?? "—",
      salesEmployeeName: p.salesEmployeeName,
      expectedDeliveryDate: p.earliestOpenDeadline,
      remainingValue: p.remainingValue.toString(),
      daysUntilDeadline: daysUntilDeadline(p.earliestOpenDeadline),
      status: p.isOpen ? "OPEN" : "CLOSED",
    });

    overdue.sort((a, b) => (a.earliestOpenDeadline?.getTime() ?? 0) - (b.earliestOpenDeadline?.getTime() ?? 0));
    upcoming.sort((a, b) => (a.earliestOpenDeadline?.getTime() ?? 0) - (b.earliestOpenDeadline?.getTime() ?? 0));

    return NextResponse.json({
      openCount: openPos.length,
      overdueCount: overdue.length,
      overdueValue,
      upcomingCount: upcoming.length,
      upcomingWindowDays: UPCOMING_WINDOW_DAYS,
      onTimeRatePct,
      rateWindowDays: RATE_WINDOW_DAYS,
      totalDeliveredValue,
      totalUndeliveredValue,
      reportMonthLabel,
      dailyWindowDays: DAILY_WINDOW_DAYS,
      dailyEmployees,
      dailyDelivery: Array.from(dayBuckets.values()),
      byEmployee: Array.from(byEmployeeMap.values()).sort((a, b) => b.overdueCount - a.overdueCount),
      manuallyClosedOrders,
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
