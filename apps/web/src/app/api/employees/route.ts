import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Danh sách nhân viên đang hoạt động (chỉ id + tên) — dùng cho các dropdown chọn đồng nghiệp mà
 * BẤT KỲ người dùng đã đăng nhập nào cũng cần gọi được (vd chọn người đi hỗ trợ khi đăng ký đi
 * công tác), khác /api/admin/users (chỉ ADMIN, trả thêm email/vai trò/mã AMIS — dữ liệu nhạy hơn
 * nên không mở cho SALES).
 */
export async function GET() {
  try {
    await requireSession();
    const users = await prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("employees GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách nhân viên" }, { status: 500 });
  }
}
