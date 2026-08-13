import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const aliases = await prisma.employeeAlias.findMany({
      include: { employee: { select: { name: true } } },
      orderBy: { aliasName: "asc" },
    });
    return NextResponse.json({ aliases });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: "Không tải được danh sách alias" }, { status: 500 });
  }
}

const createAliasSchema = z.object({
  aliasName: z.string().trim().min(1),
  employeeId: z.string().trim().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = createAliasSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const alias = await prisma.employeeAlias.upsert({
      where: { aliasName: parsed.data.aliasName },
      update: { employeeId: parsed.data.employeeId },
      create: parsed.data,
    });
    return NextResponse.json({ alias }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: "Không lưu được alias" }, { status: 500 });
  }
}
