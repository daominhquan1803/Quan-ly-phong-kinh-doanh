import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateUserSchema = z.object({
  amisEmployeeCode: z.string().trim().max(50).optional().nullable(),
  quoteAssigneeCode: z.string().trim().max(50).optional().nullable(),
  role: z.enum(["ADMIN", "SALES"]).optional(),
  active: z.boolean().optional(),
  includeInSalesStats: z.boolean().optional(),
  notifyEmail: z.string().trim().email("Email nhận thông báo không hợp lệ").max(255).optional().nullable().or(z.literal("")),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = updateUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const target = await prisma.user.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: "Không tìm thấy nhân viên" }, { status: 404 });

    const data: {
      amisEmployeeCode?: string | null;
      quoteAssigneeCode?: string | null;
      role?: "ADMIN" | "SALES";
      active?: boolean;
      includeInSalesStats?: boolean;
      notifyEmail?: string | null;
      passwordHash?: string;
    } = {};

    if (parsed.data.amisEmployeeCode !== undefined) {
      const amisEmployeeCode = parsed.data.amisEmployeeCode?.trim() || null;
      if (amisEmployeeCode) {
        const dup = await prisma.user.findUnique({ where: { amisEmployeeCode } });
        if (dup && dup.id !== params.id) {
          return NextResponse.json({ error: `Mã AMIS "${amisEmployeeCode}" đã gán cho nhân viên khác` }, { status: 409 });
        }
      }
      data.amisEmployeeCode = amisEmployeeCode;
    }

    if (parsed.data.quoteAssigneeCode !== undefined) {
      const quoteAssigneeCode = parsed.data.quoteAssigneeCode?.trim() || null;
      if (quoteAssigneeCode) {
        const dup = await prisma.user.findUnique({ where: { quoteAssigneeCode } });
        if (dup && dup.id !== params.id) {
          return NextResponse.json(
            { error: `Mã Báo giá "${quoteAssigneeCode}" đã gán cho nhân viên khác` },
            { status: 409 }
          );
        }
      }
      data.quoteAssigneeCode = quoteAssigneeCode;
    }

    if (parsed.data.role !== undefined) data.role = parsed.data.role;
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.includeInSalesStats !== undefined) data.includeInSalesStats = parsed.data.includeInSalesStats;
    if (parsed.data.notifyEmail !== undefined) data.notifyEmail = parsed.data.notifyEmail?.trim() || null;
    if (parsed.data.password) data.passwordHash = await bcrypt.hash(parsed.data.password, 10);

    // Không cho phép thao tác làm hệ thống mất hết quản trị viên đang hoạt động
    // (vd hạ quyền hoặc khoá nốt người quản trị cuối cùng) — tránh tự khoá cả hệ thống.
    const resultingRole = parsed.data.role ?? target.role;
    const resultingActive = parsed.data.active ?? target.active;
    const wasActiveAdmin = target.role === "ADMIN" && target.active;
    const willBeActiveAdmin = resultingRole === "ADMIN" && resultingActive;
    if (wasActiveAdmin && !willBeActiveAdmin) {
      const otherActiveAdmins = await prisma.user.count({
        where: { role: "ADMIN", active: true, id: { not: params.id } },
      });
      if (otherActiveAdmins === 0) {
        return NextResponse.json(
          { error: "Không thể thực hiện — hệ thống cần còn ít nhất 1 quản trị viên đang hoạt động" },
          { status: 400 }
        );
      }
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
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
      },
    });

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("admin/users/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được nhân viên" }, { status: 500 });
  }
}
