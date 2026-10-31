import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

async function loadPhoto(id: string) {
  return prisma.businessTripPhoto.findUnique({
    where: { id },
    select: {
      id: true,
      mimeType: true,
      data: true,
      stop: {
        select: {
          attendeeId: true,
          supporters: { select: { employeeId: true } },
          trip: { select: { employeeId: true, status: true, supporters: { select: { employeeId: true } } } },
        },
      },
    },
  });
}

/** Xem ảnh — chủ đăng ký, người đi hỗ trợ (cả chuyến hoặc của điểm dừng), người đi gặp điểm dừng và Quản trị viên. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const photo = await loadPhoto(params.id);
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    const t = photo.stop.trip;
    const allowed =
      session.user.role === "ADMIN" ||
      t.employeeId === session.user.id ||
      photo.stop.attendeeId === session.user.id ||
      photo.stop.supporters.some((s) => s.employeeId === session.user.id) ||
      t.supporters.some((s) => s.employeeId === session.user.id);
    if (!allowed) return NextResponse.json({ error: "Không có quyền xem ảnh này" }, { status: 403 });
    return new NextResponse(new Uint8Array(photo.data), {
      headers: {
        "Content-Type": photo.mimeType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips photo GET error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}

/** Xoá ảnh — chỉ khi báo cáo chưa nộp/đang được yêu cầu bổ sung. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const photo = await loadPhoto(params.id);
    if (!photo) return NextResponse.json({ error: "Không tìm thấy ảnh" }, { status: 404 });
    const t = photo.stop.trip;
    if (t.employeeId !== session.user.id && photo.stop.attendeeId !== session.user.id && session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Chỉ chủ đăng ký hoặc người đi gặp mới được xoá ảnh" }, { status: 403 });
    }
    if (t.status !== "PENDING" && t.status !== "NEEDS_REVISION") {
      return NextResponse.json({ error: "Báo cáo đã nộp/duyệt, không xoá ảnh được" }, { status: 400 });
    }
    await prisma.businessTripPhoto.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips photo DELETE error", err);
    return NextResponse.json({ error: "Không xoá được ảnh" }, { status: 500 });
  }
}
