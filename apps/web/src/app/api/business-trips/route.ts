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

    const where: Record<string, unknown> = {};
    // SALES thấy cả lượt đi mình đăng ký chính LẪN lượt đi mình được chọn làm người hỗ trợ (để
    // biết vì sao KPI "đi gặp khách" của mình tăng) — ADMIN thấy tất cả như cũ.
    if (session.user.role !== "ADMIN") {
      where.OR = [{ employeeId: session.user.id }, { supporters: { some: { employeeId: session.user.id } } }];
    }
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
        supporters: { include: { employee: { select: { id: true, name: true } } } },
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
  // Đồng nghiệp đi hỗ trợ cùng lượt đi này — cũng được tính KPI "đi gặp khách" khi lượt đi được
  // duyệt, không cần duyệt riêng từng người (xem model BusinessTripSupporter).
  supporterEmployeeIds: z.array(z.string().trim().min(1)).max(20).optional(),
});

/**
 * NVKD tự đăng ký đi công tác cho chính mình — chờ Quản trị viên duyệt mới được ghi nhận. Có thể
 * chọn thêm đồng nghiệp đi hỗ trợ (supporterEmployeeIds) — người hỗ trợ cũng được tính điểm KPI
 * "đi gặp khách" cho đúng lượt đi này khi lượt đi được duyệt.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    // Loại trùng + loại chính mình (đã là người đăng ký chính, không cần thêm làm người hỗ trợ) —
    // không suy đoán/báo lỗi, chỉ lặng lẽ bỏ qua các trường hợp không hợp lệ này.
    const supporterIds = Array.from(new Set(parsed.data.supporterEmployeeIds ?? [])).filter(
      (id) => id !== session.user.id
    );
    // Xác thực đúng là nhân viên đang hoạt động — tránh gán nhầm ID rác/ID đã khoá tài khoản vào
    // KPI người khác.
    const validSupporters =
      supporterIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: supporterIds }, active: true }, select: { id: true } })
        : [];

    const trip = await prisma.businessTripRequest.create({
      data: {
        employeeId: session.user.id,
        visitDate: new Date(parsed.data.visitDate),
        expectedTime: parsed.data.expectedTime?.trim() || null,
        companyName: parsed.data.companyName.trim(),
        content: parsed.data.content.trim(),
        supporters: {
          create: validSupporters.map((u) => ({ employeeId: u.id })),
        },
      },
      include: { supporters: { include: { employee: { select: { id: true, name: true } } } } },
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips POST error", err);
    return NextResponse.json({ error: "Không tạo được đăng ký đi công tác" }, { status: 500 });
  }
}
