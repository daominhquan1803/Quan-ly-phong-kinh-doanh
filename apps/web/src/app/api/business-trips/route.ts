import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";
import { stopSchema } from "@/lib/business-trip-schema";
import { isWeekEntryLocked, snapToWeekStart, weekLockedMessage } from "@/lib/week-plan";

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
        stops: { orderBy: { orderIndex: "asc" } },
      },
      orderBy: { visitDate: "desc" },
      take: 500,
    });

    // entryLocked: quá hạn đăng ký của tuần chứa ngày đi (hết thứ Hai tuần kế tiếp) — NVKD không còn
    // sửa/huỷ được, chỉ Quản trị viên (cùng quy tắc khoá nhập liệu Kế hoạch tuần).
    return NextResponse.json({
      trips: trips.map((t) => ({ ...t, entryLocked: isWeekEntryLocked(snapToWeekStart(t.visitDate)) })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách đăng ký đi công tác" }, { status: 500 });
  }
}

const createSchema = z.object({
  visitDate: z.string().min(1, "Thiếu ngày đi"),
  // 1 buổi đi công tác có thể ghé NHIỀU khách hàng — mỗi khách 1 dòng riêng (tên/địa chỉ/giờ dự
  // kiến/nội dung), thứ tự trong mảng = thứ tự ghé dự kiến.
  stops: z.array(stopSchema).min(1, "Cần ít nhất 1 khách hàng đến gặp").max(20),
  // Đồng nghiệp đi hỗ trợ cùng lượt đi này — cũng được tính KPI "đi gặp khách" khi lượt đi được
  // duyệt, không cần duyệt riêng từng người (xem model BusinessTripSupporter).
  supporterEmployeeIds: z.array(z.string().trim().min(1)).max(20).optional(),
  // Chỉ ADMIN: đăng ký bổ sung HỘ nhân viên (kể cả sau hạn khoá) — bỏ qua nếu không phải ADMIN.
  employeeId: z.string().trim().min(1).optional(),
});

/**
 * NVKD tự đăng ký đi công tác cho chính mình — chờ Quản trị viên duyệt mới được ghi nhận. 1 buổi
 * đi có thể ghé nhiều khách hàng (stops). Có thể chọn thêm đồng nghiệp đi hỗ trợ
 * (supporterEmployeeIds) — người hỗ trợ cũng được tính điểm KPI "đi gặp khách" cho đúng các
 * khách trong lượt đi này khi lượt đi được duyệt.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const isAdmin = session.user.role === "ADMIN";
    const visitDate = new Date(parsed.data.visitDate);
    if (Number.isNaN(visitDate.getTime())) {
      return NextResponse.json({ error: "Ngày đi không hợp lệ" }, { status: 400 });
    }
    // Quá hạn đăng ký (hết thứ Hai của tuần kế tiếp sau tuần chứa ngày đi) — chỉ ADMIN được bổ sung.
    if (!isAdmin && isWeekEntryLocked(snapToWeekStart(visitDate))) {
      return NextResponse.json({ error: weekLockedMessage(snapToWeekStart(visitDate)) }, { status: 403 });
    }
    const ownerId = isAdmin && parsed.data.employeeId ? parsed.data.employeeId : session.user.id;
    const onBehalf = ownerId !== session.user.id;
    if (onBehalf) {
      const owner = await prisma.user.findFirst({ where: { id: ownerId, active: true }, select: { id: true } });
      if (!owner) return NextResponse.json({ error: "Nhân viên không hợp lệ" }, { status: 400 });
    }

    // Loại trùng + loại chính người đăng ký (đã là người đăng ký chính, không cần thêm làm người
    // hỗ trợ) — không suy đoán/báo lỗi, chỉ lặng lẽ bỏ qua các trường hợp không hợp lệ này.
    const supporterIds = Array.from(new Set(parsed.data.supporterEmployeeIds ?? [])).filter((id) => id !== ownerId);
    // Xác thực đúng là nhân viên đang hoạt động — tránh gán nhầm ID rác/ID đã khoá tài khoản vào
    // KPI người khác.
    const validSupporters =
      supporterIds.length > 0
        ? await prisma.user.findMany({ where: { id: { in: supporterIds }, active: true }, select: { id: true } })
        : [];

    const trip = await prisma.businessTripRequest.create({
      data: {
        employeeId: ownerId,
        visitDate,
        // Admin đăng ký bổ sung hộ nhân viên thì duyệt luôn (admin chính là người duyệt).
        ...(onBehalf ? { status: "APPROVED" as const, approvedById: session.user.id, approvedAt: new Date() } : {}),
        supporters: {
          create: validSupporters.map((u) => ({ employeeId: u.id })),
        },
        stops: {
          create: parsed.data.stops.map((s, i) => ({
            orderIndex: i + 1,
            companyName: s.companyName.trim(),
            address: s.address?.trim() || null,
            expectedTime: s.expectedTime?.trim() || null,
            content: s.content.trim(),
          })),
        },
      },
      include: {
        supporters: { include: { employee: { select: { id: true, name: true } } } },
        stops: { orderBy: { orderIndex: "asc" } },
      },
    });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips POST error", err);
    return NextResponse.json({ error: "Không tạo được đăng ký đi công tác" }, { status: 500 });
  }
}
