import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Xem ảnh — quản trị, người tải lên, hoặc NVKD phụ trách khách của lần ghi. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const photo = await prisma.careLogPhoto.findUnique({
      where: { id: params.id },
      select: { mimeType: true, data: true, uploaderId: true, log: { select: { employeeId: true, customer: { select: { salesEmployeeId: true } } } } },
    });
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    const uid = session.user.id;
    const allowed =
      session.user.role === "ADMIN" || photo.uploaderId === uid || photo.log?.employeeId === uid || photo.log?.customer.salesEmployeeId === uid;
    if (!allowed) return NextResponse.json({ error: "Không có quyền xem ảnh này" }, { status: 403 });
    return new NextResponse(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care photo GET error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}

/** Xoá ảnh đã tải lên nhưng chưa gắn vào lần ghi nào (NVKD gỡ ảnh chọn nhầm). Ảnh đã gắn là minh chứng, không xoá. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const photo = await prisma.careLogPhoto.findUnique({ where: { id: params.id }, select: { uploaderId: true, logId: true } });
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    if (photo.uploaderId !== session.user.id) return NextResponse.json({ error: "Không có quyền xoá ảnh này" }, { status: 403 });
    if (photo.logId) return NextResponse.json({ error: "Ảnh đã gắn vào lần ghi chăm sóc, không xoá được" }, { status: 400 });
    await prisma.careLogPhoto.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care photo DELETE error", err);
    return NextResponse.json({ error: "Không xoá được ảnh" }, { status: 500 });
  }
}
