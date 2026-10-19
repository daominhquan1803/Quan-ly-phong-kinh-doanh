import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getCareTeamReport } from "@/lib/customer-care-team";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Thống kê chăm sóc khách của phòng trong 1 ngày (?date=YYYY-MM-DD, mặc định hôm nay). ADMIN thấy cả phòng; SALES chỉ số liệu của mình. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const date = new URL(req.url).searchParams.get("date") ?? undefined;
    const report = await getCareTeamReport({
      date,
      onlyEmployeeId: session.user.role === "ADMIN" ? undefined : session.user.id,
    });
    return NextResponse.json({ report, scope: session.user.role === "ADMIN" ? "TEAM" : "SELF" });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care/team GET error", err);
    return NextResponse.json({ error: "Không tải được thống kê chăm sóc" }, { status: 500 });
  }
}
