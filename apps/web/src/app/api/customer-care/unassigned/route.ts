import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { getUnassignedCustomers } from "@/lib/customer-care-unassigned";

export const dynamic = "force-dynamic";

/** Khách chưa có người phụ trách + danh sách người có thể nhận (NVKD và quản trị viên đang hoạt động). Chỉ ADMIN xem. */
export async function GET() {
  try {
    await requireAdmin();
    const [rows, employees] = await Promise.all([
      getUnassignedCustomers(),
      prisma.user.findMany({
        where: { active: true, OR: [{ role: "SALES" }, { role: "ADMIN", accessLevel: "FULL" }] },
        select: { id: true, name: true, role: true },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json({ rows, employees });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customer-care/unassigned GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách chưa phân" }, { status: 500 });
  }
}
