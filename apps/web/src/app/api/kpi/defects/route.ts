import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

/** Danh sách biên bản hàng lỗi trong 1 tháng — chỉ Quản trị viên xem/quản lý (dùng để tính KPI
 * CSKH & Chất lượng, không phải trang tra cứu chung). */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(req.url);
    const year = Number(searchParams.get("year"));
    const month = Number(searchParams.get("month"));

    const where =
      year && month
        ? { reportDate: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) } }
        : {};

    const defects = await prisma.defectReport.findMany({
      where,
      include: { employee: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
      orderBy: { reportDate: "desc" },
      take: 200,
    });

    return NextResponse.json({ defects });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi/defects GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách biên bản hàng lỗi" }, { status: 500 });
  }
}

const createSchema = z.object({
  reportNumber: z.string().trim().min(1, "Thiếu số biên bản"),
  employeeId: z.string().min(1, "Thiếu nhân viên chịu trách nhiệm"),
  reportDate: z.string().min(1, "Thiếu ngày lập biên bản"),
  description: z.string().trim().min(1, "Thiếu nội dung lỗi"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const defect = await prisma.defectReport.create({
      data: {
        reportNumber: parsed.data.reportNumber.trim(),
        employeeId: parsed.data.employeeId,
        reportDate: new Date(parsed.data.reportDate),
        description: parsed.data.description.trim(),
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ defect }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi/defects POST error", err);
    return NextResponse.json({ error: "Không lưu được biên bản hàng lỗi" }, { status: 500 });
  }
}
