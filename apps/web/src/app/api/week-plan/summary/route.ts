import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getWeekPlanReport } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

/**
 * Báo cáo tiến độ Kế hoạch làm việc tuần (chỉ tiêu vs thực tế) — tính trực tiếp mỗi lần gọi nên
 * luôn phản ánh dữ liệu mới nhất ("cập nhật hàng ngày" không cần snapshot riêng). SALES chỉ thấy
 * dòng của chính mình; ADMIN thấy cả phòng.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const weekStartParam = searchParams.get("weekStart");
    const weekStartInput = weekStartParam ? new Date(weekStartParam) : new Date();
    if (Number.isNaN(weekStartInput.getTime())) {
      return NextResponse.json({ error: "weekStart không hợp lệ" }, { status: 400 });
    }

    const onlyEmployeeId = session.user.role === "ADMIN" ? undefined : session.user.id;
    const report = await getWeekPlanReport(weekStartInput, onlyEmployeeId);

    return NextResponse.json({
      weekStart: report.weekStart.toISOString(),
      rows: report.rows,
      isAdmin: session.user.role === "ADMIN",
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("week-plan summary GET error", err);
    return NextResponse.json({ error: "Không tải được báo cáo tiến độ" }, { status: 500 });
  }
}

