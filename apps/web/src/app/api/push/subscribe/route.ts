import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().trim().min(1),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
  userAgent: z.string().trim().max(500).optional(),
});

/** Lưu đăng ký nhận push của 1 thiết bị cho người đang đăng nhập — upsert theo endpoint (mỗi
 * thiết bị/trình duyệt có 1 endpoint duy nhất do OS cấp), để đăng ký lại (vd sau khi xoá cache)
 * không tạo bản ghi trùng. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      create: {
        userId: session.user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent,
      },
      // Cùng 1 endpoint có thể đổi chủ nếu 1 thiết bị dùng chung được đăng nhập bởi người khác
      // sau đó — luôn cập nhật lại đúng userId hiện tại thay vì giữ chủ cũ.
      update: {
        userId: session.user.id,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        userAgent: parsed.data.userAgent,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("push/subscribe POST error", err);
    return NextResponse.json({ error: "Không lưu được đăng ký nhận thông báo đẩy" }, { status: 500 });
  }
}

const unsubscribeSchema = z.object({ endpoint: z.string().trim().min(1) });

/** Huỷ đăng ký nhận push của 1 thiết bị — chỉ xoá được bản ghi của CHÍNH mình (dù endpoint gần
 * như không thể đoán được, vẫn kiểm tra userId cho chắc). */
export async function DELETE(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = unsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    await prisma.pushSubscription.deleteMany({
      where: { endpoint: parsed.data.endpoint, userId: session.user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("push/subscribe DELETE error", err);
    return NextResponse.json({ error: "Không huỷ được đăng ký nhận thông báo đẩy" }, { status: 500 });
  }
}
