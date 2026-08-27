import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Danh sách thông báo của CHÍNH người đang đăng nhập — mới nhất trước, tối đa 50 dòng. */
export async function GET() {
  try {
    const session = await requireSession();
    const notifications = await prisma.notification.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: session.user.id, readAt: null },
    });
    return NextResponse.json({ notifications, unreadCount });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("notifications GET error", err);
    return NextResponse.json({ error: "Không tải được thông báo" }, { status: 500 });
  }
}

const patchSchema = z.object({
  // Đánh dấu đã đọc — truyền 1 id cụ thể, hoặc "all" để đánh dấu hết.
  id: z.string().min(1),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    if (parsed.data.id === "all") {
      await prisma.notification.updateMany({
        where: { userId: session.user.id, readAt: null },
        data: { readAt: new Date() },
      });
    } else {
      // updateMany + userId trong where — tránh 1 người đánh dấu đọc thông báo của người khác dù
      // biết id, mà không cần query riêng để kiểm tra chủ sở hữu trước.
      await prisma.notification.updateMany({
        where: { id: parsed.data.id, userId: session.user.id },
        data: { readAt: new Date() },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("notifications PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được thông báo" }, { status: 500 });
  }
}
