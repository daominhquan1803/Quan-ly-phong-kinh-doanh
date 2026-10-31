import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { MAX_PHOTOS_PER_STOP, MAX_PHOTO_BYTES, sniffImageMime } from "@/lib/business-trip-report";

export const dynamic = "force-dynamic";

/** Tải 1 ảnh chứng minh buổi gặp lên cho 1 khách (multipart, field "file") — chủ đăng ký, người đi gặp điểm dừng đó hoặc Quản trị viên, khi chưa nộp báo cáo hoặc đang được yêu cầu bổ sung. */
export async function POST(req: NextRequest, { params }: { params: { stopId: string } }) {
  try {
    const session = await requireSession();
    const stop = await prisma.businessTripStop.findUnique({
      where: { id: params.stopId },
      select: { id: true, attendeeId: true, trip: { select: { employeeId: true, status: true } }, _count: { select: { photos: true } } },
    });
    if (!stop) return NextResponse.json({ error: "Không tìm thấy khách hàng này" }, { status: 404 });
    const isAdmin = session.user.role === "ADMIN";
    if (stop.trip.employeeId !== session.user.id && stop.attendeeId !== session.user.id && !isAdmin) {
      return NextResponse.json({ error: "Chỉ chủ đăng ký hoặc người đi gặp mới được tải ảnh" }, { status: 403 });
    }
    if (stop.trip.status !== "PENDING" && stop.trip.status !== "NEEDS_REVISION") {
      return NextResponse.json({ error: "Báo cáo đã nộp/duyệt, không tải thêm ảnh được" }, { status: 400 });
    }
    if (stop._count.photos >= MAX_PHOTOS_PER_STOP) {
      return NextResponse.json({ error: `Tối đa ${MAX_PHOTOS_PER_STOP} ảnh cho mỗi khách` }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file ảnh" }, { status: 400 });
    if (file.size > MAX_PHOTO_BYTES) {
      return NextResponse.json({ error: "Ảnh quá lớn (tối đa 2MB) — thử lại, hệ thống sẽ tự nén" }, { status: 413 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffImageMime(buf);
    if (!mime) return NextResponse.json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WebP" }, { status: 400 });

    const photo = await prisma.businessTripPhoto.create({
      data: { stopId: stop.id, mimeType: mime, sizeBytes: buf.length, data: buf },
      select: { id: true },
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips photo POST error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}
