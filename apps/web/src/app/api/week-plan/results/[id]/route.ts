import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Xoá 1 dòng kết quả đã ghi nhầm — chủ dòng hoặc ADMIN mới được xoá. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const entry = await prisma.weekPlanResultEntry.findUnique({ where: { id: params.id } });
    if (!entry) return NextResponse.json({ error: "Không tìm thấy dòng kết quả" }, { status: 404 });
    if (session.user.role !== "ADMIN" && entry.employeeId !== session.user.id) {
      throw new ForbiddenError("Không có quyền xoá dòng của người khác");
    }
    await prisma.weekPlanResultEntry.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("week-plan results DELETE error", err);
    return NextResponse.json({ error: "Không xoá được dòng kết quả" }, { status: 500 });
  }
}
