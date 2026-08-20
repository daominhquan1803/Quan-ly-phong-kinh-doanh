import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  targetProfitPct: z.number().nullable().optional(),
  actualProfitPct: z.number().nullable().optional(),
  targetNewCustomers: z.number().int().nullable().optional(),
  actualNewCustomers: z.number().int().nullable().optional(),
  debtOverduePct: z.number().nullable().optional(),
  debtCollectionRatePct: z.number().nullable().optional(),
  visitTarget: z.number().int().positive().optional(),
  attendanceDays: z.number().nullable().optional(),
  violationCount: z.number().int().nullable().optional(),
});

/** Quản trị viên nhập/sửa các chỉ tiêu KPI không tính tự động được (Lợi nhuận, KH mới, Công
 * nợ tạm thời, chỉ tiêu số lượt đi gặp KH, Thái độ & kỷ luật) cho 1 nhân viên trong 1 tháng. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { employeeId, year, month, ...fields } = parsed.data;

    const entry = await prisma.kpiMonthlyEntry.upsert({
      where: { employeeId_year_month: { employeeId, year, month } },
      update: { ...fields, updatedById: session.user.id },
      create: { employeeId, year, month, ...fields, updatedById: session.user.id },
    });

    return NextResponse.json({ entry });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi/entries POST error", err);
    return NextResponse.json({ error: "Không lưu được chỉ tiêu KPI" }, { status: 500 });
  }
}
