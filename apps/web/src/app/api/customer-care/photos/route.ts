import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { MAX_PHOTO_BYTES, sniffImageMime } from "@/lib/business-trip-report";
import { MAX_CARE_PHOTOS } from "@/lib/customer-care";

export const dynamic = "force-dynamic";

/** Tải 1 ảnh minh chứng (multipart, field "file") — chưa gắn lần ghi nào, gắn khi lưu lần ghi chăm sóc. Ảnh đã nén ở trình duyệt. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    // Chặn tải rác: ảnh chưa gắn của 1 người tối đa bằng số ảnh cho phép của 1 lần ghi.
    const pending = await prisma.careLogPhoto.count({ where: { uploaderId: session.user.id, logId: null } });
    if (pending >= MAX_CARE_PHOTOS * 3) return NextResponse.json({ error: "Có quá nhiều ảnh chưa gắn vào lần ghi nào, hãy lưu lần ghi hiện tại" }, { status: 400 });
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Thiếu file ảnh" }, { status: 400 });
    if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Ảnh quá lớn (tối đa 2MB)" }, { status: 413 });
    const buf = Buffer.from(await file.arrayBuffer());
    const mime = sniffImageMime(buf);
    if (!mime) return NextResponse.json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WebP" }, { status: 400 });
    const photo = await prisma.careLogPhoto.create({
      data: { uploaderId: session.user.id, mimeType: mime, sizeBytes: buf.length, data: buf },
      select: { id: true },
    });
    return NextResponse.json({ photo }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care photo POST error", err);
    return NextResponse.json({ error: "Không tải được ảnh" }, { status: 500 });
  }
}
