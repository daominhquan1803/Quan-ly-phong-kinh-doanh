import { NextResponse } from "next/server";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Trả khoá công khai VAPID cho trình duyệt dùng khi đăng ký nhận push (PushManager.subscribe) —
 * đọc thẳng biến môi trường thay vì "bake" vào bundle lúc build (NEXT_PUBLIC_*), để đổi khoá không
 * cần build lại image. Chỉ người đã đăng nhập mới lấy được, dù bản thân khoá công khai này không
 * phải bí mật. */
export async function GET() {
  try {
    await requireSession();
    return NextResponse.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("vapid-public-key GET error", err);
    return NextResponse.json({ error: "Không lấy được khoá VAPID" }, { status: 500 });
  }
}
