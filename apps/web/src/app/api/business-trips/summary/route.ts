import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Số liệu cho banner nhắc: buổi đã qua ngày đi mà chưa có báo cáo, báo cáo chờ duyệt (chưa tính điểm), việc tiếp theo trễ hạn. */
export async function GET() {
  try {
    const session = await requireSession();
    const isAdmin = session.user.role === "ADMIN";
    const mine = isAdmin ? {} : { employeeId: session.user.id };
    const todayVN = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const todayStart = new Date(`${todayVN}T00:00:00+07:00`);
    // visitDate lưu theo UTC nửa đêm của ngày chọn -> "đến hết hôm nay" = trước nửa đêm UTC của ngày mai.
    const visitUntil = new Date(`${todayVN}T00:00:00Z`);
    visitUntil.setUTCDate(visitUntil.getUTCDate() + 1);

    const [awaitingReport, awaitingReview, needsRevision, nextStepsOverdue] = await Promise.all([
      prisma.businessTripRequest.count({ where: { ...mine, status: "PENDING", visitDate: { lt: visitUntil } } }),
      prisma.businessTripRequest.count({ where: { ...mine, status: "REPORTED" } }),
      prisma.businessTripRequest.count({ where: { ...mine, status: "NEEDS_REVISION" } }),
      prisma.businessTripStop.count({
        where: {
          nextAction: { not: null },
          nextActionDoneAt: null,
          nextActionDue: { lt: todayStart },
          outcome: { in: ["MET", "RESCHEDULED"] },
          trip: { status: { in: ["REPORTED", "APPROVED"] } },
          ...(isAdmin ? {} : { nextActionOwnerId: session.user.id }),
        },
      }),
    ]);
    return NextResponse.json({ isAdmin, awaitingReport, awaitingReview, needsRevision, nextStepsOverdue });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips summary GET error", err);
    return NextResponse.json({ error: "Không tải được tóm tắt" }, { status: 500 });
  }
}
