import { NextRequest, NextResponse } from "next/server";
import { requireInternalToken, UnauthorizedError } from "@/lib/rbac";
import { buildCareAlerts } from "@/lib/customer-care-alerts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Cho worker: tin lịch chăm sóc hằng ngày, cảnh báo leo thang, tổng kết tuần (?weekly=1). Bảo vệ bằng INTERNAL_SYNC_TOKEN. */
export async function GET(req: NextRequest) {
  try {
    requireInternalToken(req);
    const weekly = new URL(req.url).searchParams.get("weekly") === "1";
    return NextResponse.json(await buildCareAlerts(new Date(), { weekly }));
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("internal/care-plan GET error", err);
    return NextResponse.json({ error: "Không tính được lịch chăm sóc" }, { status: 500 });
  }
}
