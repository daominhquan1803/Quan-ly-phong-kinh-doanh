import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { findMonthWeekForDate } from "@/lib/week-plan";
import { getAdminWeek, lineVerdict, vnDayStart } from "@/lib/admin-kpi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VN = 7 * 3600_000;
const DAY = 86_400_000;

/**
 * Cho worker (8h hằng ngày): điểm KPI tuần hiện tại của từng Admin kinh doanh + việc tồn (giao trễ chưa có lý do, hoá đơn
 * điều chỉnh chưa gán nguyên nhân, khiếu nại chưa phản hồi khách) và số lý do giao trễ chờ trưởng phòng duyệt.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const now = new Date();
    const vnToday = new Date(now.getTime() + VN);
    const week = findMonthWeekForDate(now); // container chạy TZ Asia/Ho_Chi_Minh, cùng cách lib/week-plan dùng
    const monthStart = new Date(Date.UTC(vnToday.getUTCFullYear(), vnToday.getUTCMonth(), 1) - VN);
    const today = vnDayStart(now);

    const [admins, lines, correctionsNoCause, openComplaints, pendingReasons, systemAdmins] = await Promise.all([
      prisma.user.findMany({ where: { role: "ADMIN", accessLevel: "OPERATOR", active: true }, select: { id: true, name: true } }),
      prisma.poTrackingLine.findMany({
        where: { requestedDeliveryDate: { gte: monthStart, lt: today }, baselineClosed: false, poQuantity: { gt: 0 }, delayReason: null },
        select: { id: true, requestedDeliveryDate: true, poQuantity: true, deliveryEvents: { select: { eventDate: true, quantity: true } } },
      }),
      prisma.invoiceCorrection.count({ where: { invoiceDate: { gte: monthStart }, cause: null } }),
      prisma.defectReport.findMany({ where: { respondedAt: null, closedAt: null }, select: { receivedAt: true, createdAt: true } }),
      prisma.deliveryDelayReason.count({ where: { status: "PENDING" } }),
      prisma.user.findMany({ where: { role: "ADMIN", accessLevel: "FULL", active: true }, select: { id: true } }),
    ]);

    const lateNoReason = lines.filter(
      (l) =>
        lineVerdict(
          {
            id: l.id,
            poCode: "",
            itemCode: null,
            itemName: null,
            customerCode: null,
            requestedDeliveryDate: l.requestedDeliveryDate!,
            poQuantity: Number(l.poQuantity),
            poValue: 0,
            events: l.deliveryEvents.map((e) => ({ eventDate: e.eventDate, quantity: Number(e.quantity) })),
            reason: null,
          },
          now
        ) === "LATE"
    ).length;
    const complaintsOverdue = openComplaints.filter((c) => now.getTime() > (c.receivedAt ?? c.createdAt).getTime() + DAY).length;

    const rows = await Promise.all(
      admins.map(async (a) => {
        const w = await getAdminWeek(week, a.id, now);
        return {
          adminId: a.id,
          name: a.name,
          weekLabel: w.label,
          score: w.score,
          weekPoint: w.weekPoint,
          payments: { onTime: w.payments.onTime, total: w.payments.total },
          slips: { onTime: w.slips.onTime, total: w.slips.total },
        };
      })
    );

    return NextResponse.json({
      rows,
      pending: { lateNoReason, correctionsNoCause, complaintsOpen: openComplaints.length, complaintsOverdue },
      pendingReasons,
      systemAdminIds: systemAdmins.map((s) => s.id),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/admin-kpi-status GET error", err);
    return NextResponse.json({ error: "Không lấy được trạng thái KPI Admin" }, { status: 500 });
  }
}
