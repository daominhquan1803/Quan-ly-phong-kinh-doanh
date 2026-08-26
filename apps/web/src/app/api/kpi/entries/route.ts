import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const upsertSchema = z.object({
  employeeId: z.string().min(1),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  weightRevenue: z.number().int().min(0).max(70).optional(),
  weightRevenueSX: z.number().int().min(0).max(70).optional(),
  weightNewCustomers: z.number().int().min(0).max(70).optional(),
  weightVisit: z.number().int().min(0).max(70).optional(),
  targetNewCustomers: z.number().int().nullable().optional(),
  actualNewCustomers: z.number().int().nullable().optional(),
  debtOverduePct: z.number().nullable().optional(),
  debtCollectionRatePct: z.number().nullable().optional(),
  visitTarget: z.number().int().positive().optional(),
  violationCount: z.number().int().nullable().optional(),
});

/** Quản trị viên nhập/sửa các chỉ tiêu KPI không tính tự động được (trọng số 4 mục linh hoạt,
 * KH mới, Công nợ tạm thời, chỉ tiêu số lượt đi gặp KH, số lần vi phạm) cho 1 nhân viên/1 tháng.
 * Trọng số Doanh số/DS SX/KH mới/CSKH (weightRevenue+weightRevenueSX+weightNewCustomers+
 * weightVisit) LUÔN phải cộng lại = 70 — validate mềm: chỉ cảnh báo khi ĐỦ cả 4 trường trong 1
 * lần lưu, không chặn lưu từng phần (vd chỉ sửa 1 trường không kèm 3 trường kia). */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = upsertSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { employeeId, year, month, ...fields } = parsed.data;

    if (
      fields.weightRevenue != null &&
      fields.weightRevenueSX != null &&
      fields.weightNewCustomers != null &&
      fields.weightVisit != null
    ) {
      const sum = fields.weightRevenue + fields.weightRevenueSX + fields.weightNewCustomers + fields.weightVisit;
      if (sum !== 70) {
        return NextResponse.json(
          { error: `Tổng 4 trọng số (Doanh số/DS SX/KH mới/CSKH) phải bằng 70 — hiện đang là ${sum}` },
          { status: 400 }
        );
      }
    }

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
