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
