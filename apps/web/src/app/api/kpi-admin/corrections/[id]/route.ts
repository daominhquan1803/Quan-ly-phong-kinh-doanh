import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { CORRECTION_CAUSES } from "@/lib/admin-kpi";

export const dynamic = "force-dynamic";

const schema = z.object({
  cause: z.enum(Object.keys(CORRECTION_CAUSES) as [string, ...string[]]).nullable(),
  causeNote: z.string().trim().max(1000).optional().nullable(),
});

/** Gán nguyên nhân hoá đơn thay thế/điều chỉnh (Admin kinh doanh hoặc quản trị hệ thống). Bỏ trống = tính lỗi Admin. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Chọn nguyên nhân hợp lệ" }, { status: 400 });
    const found = await prisma.invoiceCorrection.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!found) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });
    const correction = await prisma.invoiceCorrection.update({
      where: { id: params.id },
      data: {
        cause: parsed.data.cause,
        causeNote: parsed.data.causeNote || null,
        causeSetById: parsed.data.cause ? session.user.id : null,
        causeSetAt: parsed.data.cause ? new Date() : null,
      },
    });
    return NextResponse.json({ correction });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin corrections PATCH error", err);
    return NextResponse.json({ error: "Không lưu được nguyên nhân" }, { status: 500 });
  }
}
