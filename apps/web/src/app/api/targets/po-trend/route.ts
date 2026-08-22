import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getPoValueTrendByEmployee } from "@/lib/dashboard-metrics";

export const dynamic = "force-dynamic";

const MONTHS_BACK = 2; // so sánh tháng đang xem với 2 tháng trước đó (3 cột)

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

    const result = await getPoValueTrendByEmployee(
      year,
      month,
      MONTHS_BACK,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("targets/po-trend GET error", err);
    return NextResponse.json({ error: "Không tải được bảng so sánh PO lên trong tháng" }, { status: 500 });
  }
}
