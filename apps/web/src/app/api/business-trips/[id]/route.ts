import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";
import { stopSchema } from "@/lib/business-trip-schema";
import { isWeekEntryLocked, snapToWeekStart, weekLockedMessage } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel", "update"]),
  rejectReason: z.string().trim().max(500).optional(),
  // Chỉ dùng cho action "update" — sửa lại đăng ký khi NVKD gõ nhầm, cùng hình dạng dữ liệu với
  // lúc tạo mới (xem createSchema ở ../route.ts).
  visitDate: z.string().min(1).optional(),
  stops: z.array(stopSchema).min(1, "Cần ít nhất 1 khách hàng đến gặp").max(20).optional(),
  supporterEmployeeIds: z.array(z.string().trim().min(1)).max(20).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const trip = await prisma.businessTripRequest.findUnique({ where: { id: params.id } });
    if (!trip) return NextResponse.json({ error: "Không tìm thấy đăng ký" }, { status: 404 });

    const { action } = parsed.data;
    const isAdmin = session.user.role === "ADMIN";

    // Quá hạn đăng ký của tuần chứa ngày đi (hết thứ Hai tuần kế tiếp) — NVKD không còn huỷ/sửa
    // được, chỉ Quản trị viên (approve/reject vốn đã chỉ ADMIN).
    if ((action === "cancel" || action === "update") && !isAdmin && isWeekEntryLocked(snapToWeekStart(trip.visitDate))) {
      return NextResponse.json({ error: weekLockedMessage(snapToWeekStart(trip.visitDate)) }, { status: 403 });
    }

    if (action === "cancel") {
      // Chủ đăng ký (hoặc Quản trị viên) huỷ khi còn chờ duyệt.
      if (trip.employeeId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Chỉ chủ đăng ký mới được huỷ" }, { status: 403 });
      }
      if (trip.status !== "PENDING") {
        return NextResponse.json({ error: "Chỉ huỷ được đăng ký đang chờ duyệt" }, { status: 400 });
      }
      const updated = await prisma.businessTripRequest.update({
        where: { id: params.id },
        data: { status: "REJECTED", rejectReason: "Đã huỷ bởi người đăng ký" },
      });
      return NextResponse.json({ trip: updated });
    }

    if (action === "update") {
      // Chủ đăng ký tự sửa khi gõ nhầm — chỉ cho sửa lúc còn chờ duyệt, giống điều kiện "cancel"
      // (đã duyệt/từ chối thì không tự sửa được nữa, tránh đổi nội dung sau khi Quản trị viên đã
      // xem xét).
      if (trip.employeeId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Chỉ chủ đăng ký mới được sửa" }, { status: 403 });
      }
      if (trip.status !== "PENDING") {
        return NextResponse.json({ error: "Chỉ sửa được đăng ký đang chờ duyệt" }, { status: 400 });
      }
      if (!parsed.data.visitDate || !parsed.data.stops || parsed.data.stops.length === 0) {
        return NextResponse.json({ error: "Thiếu dữ liệu sửa" }, { status: 400 });
      }
      // Không cho NVKD chuyển ngày đi sang 1 tuần đã quá hạn (lách khoá bằng cách sửa ngày).
      const newVisitDate = new Date(parsed.data.visitDate);
      if (Number.isNaN(newVisitDate.getTime())) {
        return NextResponse.json({ error: "Ngày đi không hợp lệ" }, { status: 400 });
      }
      if (!isAdmin && isWeekEntryLocked(snapToWeekStart(newVisitDate))) {
        return NextResponse.json({ error: weekLockedMessage(snapToWeekStart(newVisitDate)) }, { status: 403 });
      }

      const supporterIds = Array.from(new Set(parsed.data.supporterEmployeeIds ?? [])).filter(
        (id) => id !== trip.employeeId
      );
      const validSupporters =
        supporterIds.length > 0
          ? await prisma.user.findMany({ where: { id: { in: supporterIds }, active: true }, select: { id: true } })
          : [];

      const updated = await prisma.$transaction(async (tx) => {
        await tx.businessTripStop.deleteMany({ where: { tripId: params.id } });
        await tx.businessTripSupporter.deleteMany({ where: { tripId: params.id } });
        return tx.businessTripRequest.update({
          where: { id: params.id },
          data: {
            visitDate: new Date(parsed.data.visitDate!),
            stops: {
              create: parsed.data.stops!.map((s, i) => ({
                orderIndex: i + 1,
                companyName: s.companyName.trim(),
                address: s.address?.trim() || null,
                expectedTime: s.expectedTime?.trim() || null,
                content: s.content.trim(),
              })),
            },
            supporters: { create: validSupporters.map((u) => ({ employeeId: u.id })) },
          },
          include: {
            supporters: { include: { employee: { select: { id: true, name: true } } } },
            stops: { orderBy: { orderIndex: "asc" } },
          },
        });
      });

      return NextResponse.json({ trip: updated });
    }

    // approve/reject — chỉ ADMIN.
    if (session.user.role !== "ADMIN") throw new ForbiddenError("Yêu cầu quyền quản trị viên");
    if (trip.status !== "PENDING") {
      return NextResponse.json({ error: "Đăng ký này đã được xử lý" }, { status: 400 });
    }

    const updated = await prisma.businessTripRequest.update({
      where: { id: params.id },
      data:
        action === "approve"
          ? { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date() }
          : {
              status: "REJECTED",
              approvedById: session.user.id,
              approvedAt: new Date(),
              rejectReason: parsed.data.rejectReason || null,
            },
    });

    return NextResponse.json({ trip: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("business-trips/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được đăng ký" }, { status: 500 });
  }
}
