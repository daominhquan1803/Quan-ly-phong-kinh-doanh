import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getSalesPlanLinesWithActual } from "@/lib/dashboard-metrics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

    const lines = await getSalesPlanLinesWithActual(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("targets/plan GET error", err);
    return NextResponse.json({ error: "Không tải được kế hoạch chi tiết" }, { status: 500 });
  }
}
