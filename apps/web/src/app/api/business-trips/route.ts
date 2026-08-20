import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const employeeId = searchParams.get("employeeId");
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { ...scopeByOwner(session, "employeeId") };
    if (employeeId && session.user.role === "ADMIN") where.employeeId = employeeId;
    if (status) where.status = status;
    if (year && month) {
      const y = Number(year);
      const m = Number(month);
      where.visitDate = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const trips = await prisma.businessTripRequest.findMany({
      where,
      include: {
        employee: { select: { id: true, name: true } },
        approvedBy: { select: { id: true, name: true } },
      },
      orderBy: { visitDate: "desc" },
      take: 500,
    });

    return NextResponse.json({ trips });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách đăng ký đi công tác" }, { status: 500 });
  }
}

const createSchema = z.object({
  visitDate: z.string().min(1, "Thiếu ngày đi"),
  expectedTime: z.string().trim().max(20).optional().nullable(),
  companyName: z.string().trim().min(1, "Thiếu tên công ty đến gặp"),
  content: z.string().trim().min(1, "Thiếu nội dung buổi gặp"),
});

/** NVKD tự đăng ký đi công tác cho chính mình — chờ Quản trị viên duyệt mới được ghi nhận. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const trip = await prisma.businessTripRequest.create({
      data: {
        employeeId: session.user.id,
        visitDate: new Date(parsed.data.visitDate),
        expectedTime: parsed.data.expectedTime?.trim() || null,
        companyName: parsed.data.companyName.trim(),
        content: parsed.data.content.trim(),
      },
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips POST error", err);
    return NextResponse.json({ error: "Không tạo được đăng ký đi công tác" }, { status: 500 });
  }
}
