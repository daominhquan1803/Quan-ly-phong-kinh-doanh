import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import {
  getWeekPlanReport,
  WEEK_PLAN_METRIC_LABEL,
  findMonthWeekForDate,
  formatWeekLabel,
} from "@/lib/week-plan";

export const dynamic = "force-dynamic";

/**
 * Cho worker gọi để lấy tiến độ Kế hoạch làm việc tuần của tất cả nhân viên trong TUẦN hiện tại
 * (hoặc weekStart truyền vào) — dùng để tính thông báo nhắc việc (xem apps/worker/src/
 * notifications/weekPlanReminder.ts). Bảo vệ bằng INTERNAL_SYNC_TOKEN, không qua NextAuth.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);

    const { searchParams } = new URL(req.url);
    const weekStartParam = searchParams.get("weekStart");
    const weekStartInput = weekStartParam ? new Date(weekStartParam) : new Date();
    if (Number.isNaN(weekStartInput.getTime())) {
      return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    }

    const { rows, weekStart } = await getWeekPlanReport(weekStartInput);
    const { weekIndex, end } = findMonthWeekForDate(weekStart);

    const employeeIds = rows.map((r) => r.employeeId);
    const users = await prisma.user.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, notifyEmail: true },
    });
    const notifyEmailByEmployee = new Map(users.map((u) => [u.id, u.notifyEmail]));

    return NextResponse.json({
      weekStart: weekStart.toISOString(),
      weekIndex,
      weekEnd: end.toISOString(),
      weekLabel: formatWeekLabel(weekStart),
      metricLabels: WEEK_PLAN_METRIC_LABEL,
      rows: rows.map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        notifyEmail: notifyEmailByEmployee.get(r.employeeId) ?? null,
        totalPoints: r.totalPoints,
        weekGrade: r.weekGrade,
        metrics: r.metrics,
      })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/week-plan-status GET error", err);
    return NextResponse.json({ error: "Không lấy được trạng thái Kế hoạch tuần" }, { status: 500 });
  }
}
