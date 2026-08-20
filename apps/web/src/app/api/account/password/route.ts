import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

// Tự đổi mật khẩu của chính mình — khác với /api/admin/users/[id] (PATCH) vốn chỉ ADMIN
// dùng để đặt lại mật khẩu cho người khác. Route này bất kỳ ai đã đăng nhập cũng dùng
// được, nhưng bắt buộc nhập đúng mật khẩu hiện tại để xác nhận là chính chủ.
const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Thiếu mật khẩu hiện tại"),
  newPassword: z.string().min(6, "Mật khẩu mới tối thiểu 6 ký tự"),
});

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.json({ error: "Không tìm thấy tài khoản" }, { status: 404 });

    const valid = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!valid) return NextResponse.json({ error: "Mật khẩu hiện tại không đúng" }, { status: 400 });

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("account/password PATCH error", err);
    return NextResponse.json({ error: "Không đổi được mật khẩu" }, { status: 500 });
  }
}
