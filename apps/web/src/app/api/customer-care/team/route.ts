import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getCareDetails, getCareTeamReport } from "@/lib/customer-care-team";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Thống kê chăm sóc khách của phòng trong 1 ngày (?date=YYYY-MM-DD, mặc định hôm nay; ?section=details = chỉ chi tiết). ADMIN thấy cả phòng; SALES chỉ số liệu của mình. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const params = new URL(req.url).searchParams;
    const date = params.get("date") ?? undefined;
    const onlyEmployeeId = session.user.role === "ADMIN" ? undefined : session.user.id;
    const scope = session.user.role === "ADMIN" ? "TEAM" : "SELF";
    // ?section=details: chỉ phần "Chi tiết chăm sóc" của ngày chọn (nhẹ, đổi ngày không tính lại cảnh báo)
    if (params.get("section") === "details") {
      return NextResponse.json({ details: await getCareDetails({ date, onlyEmployeeId }), scope });
    }
    const report = await getCareTeamReport({ date, onlyEmployeeId });
    return NextResponse.json({ report, scope });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care/team GET error", err);
    return NextResponse.json({ error: "Không tải được thống kê chăm sóc" }, { status: 500 });
  }
}
