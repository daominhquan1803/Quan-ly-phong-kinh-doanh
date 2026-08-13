import { auth } from "@/lib/auth";

export class UnauthorizedError extends Error {}
export class ForbiddenError extends Error {}

/**
 * Lấy session hiện tại cho 1 API route; ném lỗi nếu chưa đăng nhập.
 * Dùng trong mọi route handler cần dữ liệu theo người dùng.
 */
export async function requireSession() {
  const session = await auth();
  if (!session?.user) throw new UnauthorizedError("Chưa đăng nhập");
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") throw new ForbiddenError("Yêu cầu quyền quản trị viên");
  return session;
}

/**
 * SALES chỉ được thấy dữ liệu của chính mình; ADMIN thấy tất cả.
 * Trả về điều kiện Prisma `where` để áp vào field chỉ định (vd. "salesEmployeeId").
 */
export function scopeByOwner(
  session: Awaited<ReturnType<typeof requireSession>>,
  field: string
): Record<string, string> | Record<string, never> {
  if (session.user.role === "ADMIN") return {};
  return { [field]: session.user.id };
}
