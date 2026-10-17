import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { MAX_PHOTO_BYTES, sniffImageMime } from "@/lib/business-trip-report";

export const dynamic = "force-dynamic";

const MAX_PHOTOS_PER_DEFECT = 10;

/** Tải 1 ảnh lỗi lên biên bản (multipart, field "file") — quản trị, khi biên bản còn mở. Ảnh đã nén ở trình duyệt. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const defect = await prisma.defectReport.findUnique({
      where: { id: params.id },
      select: { id: true, status: true, _count: { select: { photos: true } } },
    });
    if (!defect) return NextResponse.json({ error: "Không tìm thấy biên bản" }, { status: 404 });
    if (defect.status === "CLOSED") return NextResponse.json({ error: "Biên bản đã đóng, không thêm ảnh được" }, { status: 400 });
    if (defect._count.photos >= MAX_PHOTOS_PER_DEFECT) {
      return NextResponse.json({ error: `Tối đa ${MAX_PHOTOS_PER_DEFECT} ảnh cho mỗi biên bản` }, { status: 400 });
    }
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file ảnh" }, { status: 400 });
    if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Ảnh quá lớn (tối đa 2MB)" }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffImageMime(buf);
    if (!mime) return NextResponse.json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WebP" }, { status: 400 });
    const photo = await prisma.defectPhoto.create({
      data: { defectReportId: defect.id, mimeType: mime, sizeBytes: buf.length, data: buf },
      select: { id: true },
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("defects photo POST error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}
