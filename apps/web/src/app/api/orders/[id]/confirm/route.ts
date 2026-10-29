import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { MAX_PHOTO_BYTES, sniffImageMime } from "@/lib/business-trip-report";

export const dynamic = "force-dynamic";

const MAX_PHOTOS = 3;

/** Admin xác nhận PKH/SX đã nhận đơn — bắt buộc kèm 1–3 ảnh chụp xác nhận (multipart, field "file"). Giờ xác nhận là giờ máy chủ, không sửa được. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    if (session.user.accessLevel === "VIEWER") throw new ForbiddenError("Tài khoản chỉ xem, không xác nhận được");
    const order = await prisma.order.findUnique({ where: { id: params.id }, select: { id: true, confirmation: { select: { id: true } } } });
    if (!order) return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
    if (order.confirmation) return NextResponse.json({ error: "Đơn này đã được xác nhận" }, { status: 409 });

    const files = (await req.formData()).getAll("file").filter((f): f is File => f instanceof File);
    if (files.length === 0) return NextResponse.json({ error: "Cần đính kèm ảnh xác nhận của PKH/SX" }, { status: 400 });
    if (files.length > MAX_PHOTOS) return NextResponse.json({ error: `Tối đa ${MAX_PHOTOS} ảnh` }, { status: 400 });
    const photos: { mimeType: string; sizeBytes: number; data: Buffer }[] = [];
    for (const f of files) {
      if (f.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: "Ảnh quá lớn (tối đa 2MB)" }, { status: 413 });
      const buf = Buffer.from(await f.arrayBuffer());
      const mime = sniffImageMime(buf);
      if (!mime) return NextResponse.json({ error: "Chỉ nhận ảnh JPG, PNG hoặc WebP" }, { status: 400 });
      photos.push({ mimeType: mime, sizeBytes: buf.length, data: buf });
    }
    const confirmation = await prisma.orderConfirmation.create({
      data: { orderId: order.id, confirmedById: session.user.id, photos: { create: photos } },
      select: { id: true, confirmedAt: true, photos: { select: { id: true } } },
    });
    return NextResponse.json({ confirmation }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    // orderId unique: 2 lần bấm gần như đồng thời — lần sau bị từ chối như "đã xác nhận".
    if ((err as { code?: string }).code === "P2002") return NextResponse.json({ error: "Đơn này đã được xác nhận" }, { status: 409 });
    console.error("orders confirm POST error", err);
    return NextResponse.json({ error: "Không lưu được xác nhận" }, { status: 500 });
  }
}
