import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";
import { stopSchema } from "@/lib/business-trip-schema";
import { isWeekEntryLocked, snapToWeekStart, weekLockedMessage } from "@/lib/week-plan";
import { PROVINCES } from "@/lib/vn-provinces";
import { notifyAssigned, resolveStops, stopsCreateData } from "@/lib/business-trip-stops";

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
      where.OR = [
        { employeeId: session.user.id },
        { supporters: { some: { employeeId: session.user.id } } },
        // Chuyến có điểm dừng mình được chọn đi gặp hoặc hỗ trợ (đăng ký chung bởi đồng nghiệp).
        { stops: { some: { OR: [{ attendeeId: session.user.id }, { supporters: { some: { employeeId: session.user.id } } }] } } },
      ];
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
        // Ảnh chỉ lấy id (nội dung ảnh phục vụ riêng qua /api/business-trips/photos/[id]).
        stops: {
          orderBy: { orderIndex: "asc" },
          include: {
            photos: { select: { id: true } },
            nextActionOwner: { select: { id: true, name: true } },
            attendee: { select: { id: true, name: true } },
            supporters: { include: { employee: { select: { id: true, name: true } } } },
          },
        },
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
  // Tỉnh/TP của chuyến (anh Quân chốt 31/10/2026) — cả phòng thấy chuyến và khách gợi ý trong tỉnh.
  provinces: z.array(z.enum(PROVINCES)).min(1, "Chọn tỉnh/TP của chuyến đi").max(5),
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
 * NVKD tự đăng ký đi công tác cho chính mình — đi xong nộp báo cáo, Quản trị viên duyệt báo cáo mới được ghi nhận. 1 buổi
 * đi có thể ghé nhiều khách hàng (stops). Có thể chọn thêm đồng nghiệp đi hỗ trợ
 * (supporterEmployeeIds) — người hỗ trợ cũng được tính điểm KPI "đi gặp khách" cho đúng các
 * khách trong lượt đi này khi báo cáo của lượt đi được duyệt.
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
    const onBehalf = ownerId !== session.user.id; // chỉ để kiểm tra nhân viên hợp lệ bên dưới
    if (onBehalf) {
      const owner = await prisma.user.findFirst({ where: { id: ownerId, active: true }, select: { id: true } });
      if (!owner) return NextResponse.json({ error: "Nhân viên không hợp lệ" }, { status: 400 });
    }

    // Người đi gặp + người hỗ trợ theo TỪNG điểm dừng (anh Quân chốt 31/10/2026): xác thực nhân viên đang hoạt động / khách có thật, mặc
    // định người đi gặp = người đăng ký. Người hỗ trợ cấp chuyến (supporterEmployeeIds) không còn dùng cho chuyến mới.
    const resolved = await resolveStops(parsed.data.stops, ownerId, session.user.id);
    if ("error" in resolved) return NextResponse.json({ error: resolved.error }, { status: 400 });

    const trip = await prisma.businessTripRequest.create({
      data: {
        employeeId: ownerId,
        visitDate,
        provinces: Array.from(new Set(parsed.data.provinces)),
        // Luồng mới: đăng ký xong ở trạng thái "Chờ báo cáo" (kể cả admin đăng ký hộ) — chỉ tính điểm sau khi có
        // báo cáo được duyệt (admin nộp báo cáo hộ thì duyệt luôn, xem action "report" ở [id]/route.ts).
        stops: { create: stopsCreateData(resolved.stops) },
      },
      include: {
        supporters: { include: { employee: { select: { id: true, name: true } } } },
        stops: { orderBy: { orderIndex: "asc" }, include: { supporters: { include: { employee: { select: { id: true, name: true } } } } } },
      },
    });

    // Người được chọn đi gặp / hỗ trợ chỉ nhận thông báo (không cần xác nhận).
    await notifyAssigned({ stops: resolved.stops, registrantId: session.user.id, registrantName: session.user.name ?? "Đồng nghiệp", visitDate });

    return NextResponse.json({ trip }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("business-trips POST error", err);
    return NextResponse.json({ error: "Không tạo được đăng ký đi công tác" }, { status: 500 });
  }
}
