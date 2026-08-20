import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getKpiMonthlyReport } from "@/lib/kpi-metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

    const rows = await getKpiMonthlyReport(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("kpi/report GET error", err);
    return NextResponse.json({ error: "Không tải được báo cáo KPI" }, { status: 500 });
  }
}
