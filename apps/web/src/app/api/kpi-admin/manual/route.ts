import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  adminId: z.string().min(1),
  year: z.number().int().min(2026).max(2100),
  month: z.number().int().min(1).max(12),
  documentsPct: z.number().min(0).max(100).nullable(),
  attitudeScore: z.number().min(0).max(5).nullable(),
  note: z.string().trim().max(2000).optional().nullable(),
});

/** Quản trị hệ thống chấm tay: % hồ sơ đầy đủ, điểm thái độ (0–5). */
export async function PUT(req: NextRequest) {
  try {
    const session = await requireSystemAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { adminId, year, month, ...rest } = parsed.data;
    const data = { documentsPct: rest.documentsPct, attitudeScore: rest.attitudeScore, note: rest.note || null, updatedById: session.user.id };
    const manual = await prisma.adminKpiManual.upsert({
      where: { adminId_year_month: { adminId, year, month } },
      create: { adminId, year, month, ...data },
      update: data,
    });
    return NextResponse.json({ manual });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin manual PUT error", err);
    return NextResponse.json({ error: "Không lưu được" }, { status: 500 });
  }
}
