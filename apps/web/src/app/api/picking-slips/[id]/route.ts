import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const slip = await prisma.pickingSlip.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { lineOrder: "asc" } }, createdBy: { select: { name: true } } },
    });
    if (!slip) return NextResponse.json({ error: "Không tìm thấy Phiếu soạn hàng" }, { status: 404 });
    return NextResponse.json({ slip });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips/[id] GET error", err);
    return NextResponse.json({ error: "Không tải được Phiếu soạn hàng" }, { status: 500 });
  }
}

/** Xoá Phiếu soạn hàng tạo nhầm — chỉ xoá phiếu (PickingSlipItem tự xoá theo qua onDelete:
 * Cascade), không đụng gì tới dữ liệu PO tracking gốc vì phiếu chỉ lưu snapshot riêng. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const slip = await prisma.pickingSlip.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!slip) return NextResponse.json({ error: "Không tìm thấy Phiếu soạn hàng" }, { status: 404 });
    await prisma.pickingSlip.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips/[id] DELETE error", err);
    return NextResponse.json({ error: "Không xoá được Phiếu soạn hàng" }, { status: 500 });
  }
}
