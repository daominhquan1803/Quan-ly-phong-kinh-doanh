import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdmin();
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        amisEmployeeCode: true,
        quoteAssigneeCode: true,
        includeInSalesStats: true,
        notifyEmail: true,
        phone: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    return NextResponse.json({ error: "Không tải được danh sách nhân viên" }, { status: 500 });
  }
}

const createUserSchema = z.object({
  name: z.string().trim().min(1, "Thiếu tên"),
  email: z.string().trim().email("Email không hợp lệ"),
  role: z.enum(["ADMIN", "SALES"]),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự"),
});

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { name, email, role, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return NextResponse.json({ error: "Email đã tồn tại" }, { status: 409 });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { name, email, role, passwordHash },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("admin/users POST error", err);
    return NextResponse.json({ error: "Không tạo được nhân viên" }, { status: 500 });
  }
}
