import { NextRequest, NextResponse } from "next/server";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { getFollowUp } from "@/lib/debt-followup";

export const dynamic = "force-dynamic";

/**
 * Cho worker gọi để lấy "Cần thu tuần này" của từng NVKD trong tuần hiện tại — dùng nhắc đầu tuần
 * qua app/Zalo (xem apps/worker/src/notifications/debtWeekReminder.ts). Bảo vệ bằng INTERNAL_SYNC_TOKEN.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const result = await getFollowUp({}, new Date());
    return NextResponse.json({
      weekStart: result.weekStart.toISOString(),
      weekEnd: result.weekEnd.toISOString(),
      rows: result.rows
        .filter((r) => r.employeeId)
        .map((r) => ({
          employeeId: r.employeeId,
          plannedCount: r.plannedCount,
          plannedAmount: r.plannedAmount,
          slippedCount: r.slippedCount,
          slippedAmount: r.slippedAmount,
        })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/debt-followup GET error", err);
    return NextResponse.json({ error: "Không lấy được danh sách cần thu" }, { status: 500 });
  }
}
