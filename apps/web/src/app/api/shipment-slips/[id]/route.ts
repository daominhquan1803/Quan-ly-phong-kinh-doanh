import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireSession();
    const slip = await prisma.shipmentSlip.findUnique({
      where: { id: params.id },
      include: {
        items: { orderBy: { lineOrder: "asc" } },
        order: { select: { id: true, orderCode: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!slip) return NextResponse.json({ error: "Không tìm thấy phiếu" }, { status: 404 });
    return NextResponse.json({ slip });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipment-slips/[id] GET error", err);
    return NextResponse.json({ error: "Không tải được phiếu" }, { status: 500 });
  }
}
