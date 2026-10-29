import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Xem ảnh xác nhận — quản trị hoặc NVKD phụ trách đơn. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const photo = await prisma.orderConfirmationPhoto.findUnique({
      where: { id: params.id },
      select: { mimeType: true, data: true, confirmation: { select: { order: { select: { salesEmployeeId: true } } } } },
    });
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    if (session.user.role !== "ADMIN" && photo.confirmation.order.salesEmployeeId !== session.user.id) {
      return NextResponse.json({ error: "Không có quyền xem ảnh này" }, { status: 403 });
    }
    return new NextResponse(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("order confirmation photo GET error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}
