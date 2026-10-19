import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { getCareOverview, getUncaredRisks } from "@/lib/customer-care-query";

export const dynamic = "force-dynamic";

/**
 * Cho worker gọi hằng ngày: (1) khách nguy cơ cao/cảnh báo (theo nhịp đặt hàng) mà NVKD chưa chăm sóc gần đây;
 * (2) khách mua theo vụ tới lúc nhắc / lỡ vụ; (3) lời hẹn chăm sóc lại đến hạn. Worker tạo Notification từ đây
 * (xem apps/worker/src/notifications/customerAlerts.ts). Bảo vệ bằng INTERNAL_SYNC_TOKEN.
 */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const now = new Date();

    // ----- (1) nguy cơ theo nhịp đặt hàng -----
    const risks = await getUncaredRisks(now);

    // ----- (2) khách theo vụ + (3) hẹn chăm sóc lại -----
    const overview = await getCareOverview({}, now);
    const seasons = overview
      .filter((c) => c.season && c.salesEmployee)
      .map((c) => ({
        employeeId: c.salesEmployee!.id,
        customerId: c.id,
        customerName: c.customerName,
        stage: c.season!.stage,
        season: c.season!.season,
        seasonMonth: c.season!.seasonMonth,
      }));
    const followUps = overview
      .filter((c) => c.salesEmployee && c.followUpAt && new Date(c.followUpAt).getTime() <= now.getTime())
      .map((c) => ({
        employeeId: c.salesEmployee!.id,
        customerId: c.id,
        customerName: c.customerName,
        followUpAt: c.followUpAt,
      }));

    // Trưởng phòng nhận bản nhắc leo thang (khách vụ ESCALATE/MISSED) và nguy cơ cao.
    const managers = await prisma.user.findMany({
      where: { role: "ADMIN", active: true, accessLevel: { in: ["FULL", "OPERATOR"] } },
      select: { id: true },
    });

    return NextResponse.json({ risks, seasons, followUps, managerIds: managers.map((m) => m.id) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/customer-alerts GET error", err);
    return NextResponse.json({ error: "Không lấy được cảnh báo khách hàng" }, { status: 500 });
  }
}
