import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateUserSchema = z.object({
  amisEmployeeCode: z.string().trim().max(50).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const amisEmployeeCode = parsed.data.amisEmployeeCode?.trim() || null;

    if (amisEmployeeCode) {
      const existing = await prisma.user.findUnique({ where: { amisEmployeeCode } });
      if (existing && existing.id !== params.id) {
        return NextResponse.json({ error: `Mã AMIS "${amisEmployeeCode}" đã gán cho nhân viên khác` }, { status: 409 });
      }
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data: { amisEmployeeCode },
      select: { id: true, name: true, amisEmployeeCode: true },
    });

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("admin/users/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được nhân viên" }, { status: 500 });
  }
}
