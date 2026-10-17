import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { defectScope } from "@/lib/defect-report";

export const dynamic = "force-dynamic";

/** Xem ảnh lỗi — quản trị, hoặc NVKD chịu trách nhiệm biên bản đó. */
export async function GET(_req: NextRequest, { params }: { params: { photoId: string } }) {
  try {
    const session = await requireSession();
    const photo = await prisma.defectPhoto.findFirst({
      where: { id: params.photoId, defectReport: defectScope(session.user) },
      select: { mimeType: true, data: true },
    });
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    return new NextResponse(new Uint8Array(photo.data), {
      headers: { "Content-Type": photo.mimeType, "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("defects photo GET error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}

/** Xoá ảnh — quản trị, khi biên bản còn mở. */
export async function DELETE(_req: NextRequest, { params }: { params: { photoId: string } }) {
  try {
    await requireAdmin();
    const photo = await prisma.defectPhoto.findUnique({ where: { id: params.photoId }, select: { id: true, defectReport: { select: { status: true } } } });
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    if (photo.defectReport.status === "CLOSED") return NextResponse.json({ error: "Biên bản đã đóng, không xoá ảnh được" }, { status: 400 });
    await prisma.defectPhoto.delete({ where: { id: photo.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("defects photo DELETE error", err);
    return NextResponse.json({ error: "Không xoá được ảnh" }, { status: 500 });
  }
}
