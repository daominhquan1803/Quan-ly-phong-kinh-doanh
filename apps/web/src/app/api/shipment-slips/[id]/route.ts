import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const slip = await prisma.shipmentSlip.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { lineOrder: "asc" } },
        order: { select: { id: true, orderCode: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!slip) return NextResponse.json({ error: "Không tìm thấy phiếu" }, { status: 404 });
    if (session.user.role !== "ADMIN" && slip.createdById !== session.user.id) {
      throw new ForbiddenError("Không có quyền xem phiếu này");
    }
    return NextResponse.json({ slip });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("shipment-slips/[id] GET error", err);
    return NextResponse.json({ error: "Không tải được phiếu" }, { status: 500 });
  }
}
