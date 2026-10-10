import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { mondayOfWeek } from "@/lib/debt-status";
import { getFollowUp } from "@/lib/debt-followup";

export const dynamic = "force-dynamic";

/** "Cần thu tuần này": GET ?date=YYYY-MM-DD (ngày bất kỳ trong tuần, mặc định hôm nay; tuần tương lai bị kéo về tuần hiện tại) &employeeId= (chỉ ADMIN). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const dateParam = searchParams.get("date");
    let target = now;
    if (dateParam) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) return NextResponse.json({ error: "date phải dạng YYYY-MM-DD" }, { status: 400 });
      const parsed = new Date(`${dateParam}T00:00:00+07:00`);
      if (Number.isNaN(parsed.getTime())) return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
      target = parsed;
    }
    if (mondayOfWeek(target) > mondayOfWeek(now)) target = now;

    const where: Prisma.DebtInvoiceWhereInput = { ...scopeByOwner(session, "salesEmployeeId") };
    const employeeId = searchParams.get("employeeId");
    if (employeeId && session.user.role === "ADMIN") where.salesEmployeeId = employeeId;

    const result = await getFollowUp(where, target, now);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/followup GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách cần thu" }, { status: 500 });
  }
}
