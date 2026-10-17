import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getAdminKpi } from "@/lib/admin-kpi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** KPI Admin kinh doanh của 1 tháng: ?month=YYYY-MM &adminId= (mặc định Admin kinh doanh đầu tiên). Quản trị (mọi mức) xem. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month") ?? new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Tháng không hợp lệ (YYYY-MM)" }, { status: 400 });
    const [year, m] = month.split("-").map(Number);

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", accessLevel: "OPERATOR", active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    if (admins.length === 0) return NextResponse.json({ admins, kpi: null });
    const adminId = searchParams.get("adminId") ?? (admins.some((a) => a.id === session.user.id) ? session.user.id : admins[0].id);
    if (!admins.some((a) => a.id === adminId)) return NextResponse.json({ error: "Không phải tài khoản Admin kinh doanh" }, { status: 400 });

    const kpi = await getAdminKpi(year, m, adminId);
    return NextResponse.json({ admins, adminId, kpi });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin GET error", err);
    return NextResponse.json({ error: "Không tính được KPI Admin" }, { status: 500 });
  }
}
