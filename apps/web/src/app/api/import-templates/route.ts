import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const templates = await prisma.importTemplate.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, columnMapping: true, createdAt: true },
    });
    return NextResponse.json({ templates });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: "Không tải được danh sách template" }, { status: 500 });
  }
}
