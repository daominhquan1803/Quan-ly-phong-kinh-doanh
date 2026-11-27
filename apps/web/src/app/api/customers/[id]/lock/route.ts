import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSystemAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Khoá tạm / mở khoá khách (chỉ quản trị hệ thống). Khoá không đụng dữ liệu, công nợ vẫn hiện. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSystemAdmin();
    const body = (await req.json()) as { locked?: unknown };
    if (typeof body.locked !== "boolean") return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    await prisma.customer.update({ where: { id: params.id }, data: { lockedAt: body.locked ? new Date() : null } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/[id]/lock POST error", err);
    return NextResponse.json({ error: "Không khoá/mở khoá được khách hàng" }, { status: 500 });
  }
}
