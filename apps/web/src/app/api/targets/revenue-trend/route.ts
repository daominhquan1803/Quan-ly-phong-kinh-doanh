import { NextRequest, NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { getRevenueTrendByEmployee } from "@/lib/dashboard-metrics";

export const dynamic = "force-dynamic";

/**
 * Bảng "Doanh số đi hàng từ đầu năm" — mặc định trải từ Tháng 1 tới tháng hiện tại của năm nay;
 * nếu chọn năm khác năm hiện tại thì mặc định trải trọn 12 tháng (đã qua hết năm đó), trừ khi
 * client tự truyền `month` (đến tháng) khác.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const monthParam = searchParams.get("month");
    const uptoMonth = monthParam ? Number(monthParam) : year === now.getFullYear() ? now.getMonth() + 1 : 12;

    const result = await getRevenueTrendByEmployee(
      year,
      uptoMonth,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("targets/revenue-trend GET error", err);
    return NextResponse.json({ error: "Không tải được bảng doanh số đi hàng từ đầu năm" }, { status: 500 });
  }
}
