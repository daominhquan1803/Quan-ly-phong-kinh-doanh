import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { WEEK_PLAN_METRICS, getWeekPlanMetricDetail, snapToWeekStart } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

/**
 * Danh sách chi tiết tạo nên 1 ô trong Báo cáo tiến độ tuần (1 nhân viên x 1 mục x 1 tuần).
 * SALES chỉ xem được của chính mình; ADMIN xem được của bất kỳ ai (truyền employeeId).
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const weekStartParam = searchParams.get("weekStart");
    const metric = searchParams.get("metric");
    if (!weekStartParam) return NextResponse.json({ error: "Thiếu weekStart" }, { status: 400 });
    if (!metric || !WEEK_PLAN_METRICS.includes(metric as (typeof WEEK_PLAN_METRICS)[number])) {
      return NextResponse.json({ error: "Mục không hợp lệ" }, { status: 400 });
    }
    const weekStart = snapToWeekStart(new Date(weekStartParam));
    if (Number.isNaN(weekStart.getTime())) {
      return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    }

    const employeeId =
      session.user.role === "ADMIN" ? searchParams.get("employeeId") ?? session.user.id : session.user.id;

    const items = await getWeekPlanMetricDetail(weekStart, employeeId, metric as (typeof WEEK_PLAN_METRICS)[number]);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("week-plan detail GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách chi tiết" }, { status: 500 });
  }
}
