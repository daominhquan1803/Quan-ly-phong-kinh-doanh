import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getEmployeeTargetVsActual } from "@/lib/dashboard-metrics";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year") ?? now.getFullYear());
    const month = Number(searchParams.get("month") ?? now.getMonth() + 1);

    const rows = await getEmployeeTargetVsActual(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    return NextResponse.json({ rows });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("targets GET error", err);
    return NextResponse.json({ error: "Không tải được kế hoạch kinh doanh" }, { status: 500 });
  }
}

const upsertSchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  targetRevenue: z.number().nonnegative(),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { employeeId, year, month, targetRevenue } = parsed.data;

    const target = await prisma.salesTarget.upsert({
      where: { employeeId_year_month: { employeeId, year, month } },
      update: { targetRevenue },
      create: { employeeId, year, month, targetRevenue },
    });

    return NextResponse.json({ target });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("targets POST error", err);
    return NextResponse.json({ error: "Không lưu được chỉ tiêu" }, { status: 500 });
  }
}
