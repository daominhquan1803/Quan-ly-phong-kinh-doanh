import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { getKpiMonthlyReport } from "@/lib/kpi-metrics";

export const dynamic = "force-dynamic";

/**
 * Cho worker gọi để lấy tiến độ KPI tháng hiện tại (hoặc year/month truyền vào) của tất cả nhân
 * viên — dùng để tính thông báo nhắc việc khi tiến độ đang chậm hơn số ngày đã trôi qua của
 * tháng (xem apps/worker/src/notifications/kpiReminder.ts, phần so sánh nhịp độ nằm bên worker,
 * route này chỉ trả số liệu thô). Bảo vệ bằng INTERNAL_SYNC_TOKEN, không qua NextAuth.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);

    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "year/month không hợp lệ" }, { status: 400 });
    }

    const rows = await getKpiMonthlyReport(year, month);
    const employeeIds = rows.map((r) => r.employeeId);
    const users = await prisma.user.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, notifyEmail: true },
    });
    const notifyEmailByEmployee = new Map(users.map((u) => [u.id, u.notifyEmail]));

    return NextResponse.json({
      year,
      month,
      daysInMonth: new Date(year, month, 0).getDate(),
      today: now.getDate(),
      rows: rows.map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        notifyEmail: notifyEmailByEmployee.get(r.employeeId) ?? null,
        targetRevenue: r.targetRevenue,
        actualRevenue: r.actualRevenue,
        revenuePct: r.revenuePct,
        targetRevenueSX: r.targetRevenueSX,
        actualRevenueSX: r.actualRevenueSX,
        revenueSXPct: r.revenueSXPct,
        targetNewCustomers: r.targetNewCustomers,
        actualNewCustomers: r.actualNewCustomers,
        visitTarget: r.visitTarget,
        approvedVisitCount: r.approvedVisitCount,
        totalScore: r.totalScore,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/kpi-status GET error", err);
    return NextResponse.json({ error: "Không lấy được trạng thái KPI tháng" }, { status: 500 });
  }
}
