import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, ForbiddenError, UnauthorizedError, isSystemAdmin } from "@/lib/rbac";
import { z } from "zod";
import { stopSchema } from "@/lib/business-trip-schema";
import { reportSchema, validateReportStops } from "@/lib/business-trip-report";
import { notifyAdmins, notifyUser } from "@/lib/business-trip-notify";
import { isWeekEntryLocked, snapToWeekStart, weekLockedMessage } from "@/lib/week-plan";
import { PROVINCES } from "@/lib/vn-provinces";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  // report: NVKD nộp báo cáo sau buổi gặp (hoặc nộp lại khi được yêu cầu bổ sung) — Quản trị viên nộp hộ thì duyệt luôn.
  // revise: Quản trị viên trả báo cáo về để bổ sung (bắt buộc ghi lý do).
  action: z.enum(["approve", "reject", "revise", "cancel", "update", "report"]),
  rejectReason: z.string().trim().max(500).optional(),
  // Chỉ dùng cho action "update" — sửa lại đăng ký khi NVKD gõ nhầm, cùng hình dạng dữ liệu với
  // lúc tạo mới (xem createSchema ở ../route.ts).
  visitDate: z.string().min(1).optional(),
  // action "update": tỉnh/TP của chuyến (bắt buộc khi sửa — chuyến cũ chưa có tỉnh phải chọn lại).
  provinces: z.array(z.enum(PROVINCES)).max(5).optional(),
  // action "update": danh sách khách đăng ký (kiểm tra bằng stopSchema bên dưới); action "report": mảng báo cáo từng khách (reportSchema) — cùng tên field nên ở đây để lỏng.
  stops: z.array(z.unknown()).optional(),
  supporterEmployeeIds: z.array(z.string().trim().min(1)).max(20).optional(),
});

const todayVN = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const trip = await prisma.businessTripRequest.findUnique({
      where: { id: params.id },
      include: { stops: { orderBy: { orderIndex: "asc" } }, employee: { select: { name: true } } },
    });
    if (!trip) return NextResponse.json({ error: "Không tìm thấy đăng ký" }, { status: 404 });

    const { action } = parsed.data;
    const isAdmin = session.user.role === "ADMIN";
    // Duyệt / tự duyệt báo cáo công tác chỉ quản trị hệ thống (Admin kinh doanh, tài khoản chỉ xem không duyệt).
    const canApprove = isSystemAdmin(session);

    // Quá hạn đăng ký của tuần chứa ngày đi (hết thứ Hai tuần kế tiếp) — NVKD không còn huỷ/sửa/nộp
    // báo cáo được, chỉ Quản trị viên (approve/reject vốn đã chỉ ADMIN).
    if (
      (action === "cancel" || action === "update" || action === "report") &&
      !isAdmin &&
      isWeekEntryLocked(snapToWeekStart(trip.visitDate))
    ) {
      return NextResponse.json({ error: weekLockedMessage(snapToWeekStart(trip.visitDate)) }, { status: 403 });
    }

    if (action === "cancel") {
      // Chủ đăng ký (hoặc Quản trị viên) huỷ khi chưa nộp báo cáo.
      if (trip.employeeId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Chỉ chủ đăng ký mới được huỷ" }, { status: 403 });
      }
      if (trip.status !== "PENDING") {
        return NextResponse.json({ error: "Chỉ huỷ được đăng ký chưa nộp báo cáo" }, { status: 400 });
      }
      const updated = await prisma.businessTripRequest.update({
        where: { id: params.id },
        data: { status: "REJECTED", rejectReason: "Đã huỷ bởi người đăng ký" },
      });
      return NextResponse.json({ trip: updated });
    }

    if (action === "update") {
      // Chủ đăng ký tự sửa khi gõ nhầm — chỉ cho sửa lúc chưa nộp báo cáo (đã nộp/duyệt thì không tự sửa nữa).
      if (trip.employeeId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Chỉ chủ đăng ký mới được sửa" }, { status: 403 });
      }
      if (trip.status !== "PENDING") {
        return NextResponse.json({ error: "Chỉ sửa được đăng ký chưa nộp báo cáo" }, { status: 400 });
      }
      const updStops = z.array(stopSchema).min(1, "Cần ít nhất 1 khách hàng đến gặp").max(20).safeParse(parsed.data.stops);
      if (!parsed.data.visitDate || !updStops.success) {
        return NextResponse.json({ error: (!updStops.success && updStops.error.issues[0]?.message) || "Thiếu dữ liệu sửa" }, { status: 400 });
      }
      if (!parsed.data.provinces || parsed.data.provinces.length === 0) {
        return NextResponse.json({ error: "Chọn tỉnh/TP của chuyến đi" }, { status: 400 });
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
            provinces: Array.from(new Set(parsed.data.provinces)),
            stops: {
              create: updStops.data.map((s, i) => ({
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

    if (action === "report") {
      if (trip.employeeId !== session.user.id && !isAdmin) {
        return NextResponse.json({ error: "Chỉ chủ đăng ký mới được nộp báo cáo" }, { status: 403 });
      }
      if (trip.status !== "PENDING" && trip.status !== "NEEDS_REVISION") {
        return NextResponse.json({ error: "Đăng ký này không ở trạng thái nộp báo cáo" }, { status: 400 });
      }
      if (trip.visitDate.toISOString().slice(0, 10) > todayVN()) {
        return NextResponse.json({ error: "Chưa tới ngày đi, chưa nộp báo cáo được" }, { status: 400 });
      }
      const rep = reportSchema.safeParse(body);
      if (!rep.success) {
        return NextResponse.json({ error: rep.error.issues[0]?.message ?? "Báo cáo không hợp lệ" }, { status: 400 });
      }
      const stopIds = new Set(trip.stops.map((s) => s.id));
      const reported = new Set(rep.data.stops.map((s) => s.stopId));
      if (reported.size !== rep.data.stops.length || [...reported].some((id) => !stopIds.has(id)) || reported.size !== stopIds.size) {
        return NextResponse.json({ error: "Báo cáo phải có đủ từng khách của buổi đi (mỗi khách 1 lần)" }, { status: 400 });
      }

      const photoRows = await prisma.businessTripPhoto.groupBy({
        by: ["stopId"],
        where: { stopId: { in: [...stopIds] } },
        _count: { _all: true },
      });
      const photoCount = new Map(photoRows.map((r) => [r.stopId, r._count._all]));
      // Khách đã có định vị từ lần nộp trước (NEEDS_REVISION) vẫn tính là có bằng chứng.
      for (const s of trip.stops) if (s.checkinLat != null) photoCount.set(s.id, (photoCount.get(s.id) ?? 0) + 1);
      const errors = validateReportStops(rep.data.stops, photoCount, !isAdmin);
      if (errors.length > 0) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

      const ownerIds = Array.from(
        new Set(rep.data.stops.map((s) => s.nextActionOwnerId).filter((x): x is string => !!x && x !== trip.employeeId))
      );
      const validOwners = new Set(
        ownerIds.length > 0
          ? (await prisma.user.findMany({ where: { id: { in: ownerIds }, active: true }, select: { id: true } })).map((u) => u.id)
          : []
      );
      validOwners.add(trip.employeeId);

      const now = new Date();
      const updated = await prisma.$transaction(async (tx) => {
        for (const s of rep.data.stops) {
          const hasNext = s.outcome === "MET" || s.outcome === "RESCHEDULED";
          await tx.businessTripStop.update({
            where: { id: s.stopId },
            data: {
              outcome: s.outcome,
              contactName: s.contactName?.trim() || null,
              contactPhone: s.contactPhone?.trim() || null,
              reportContent: s.reportContent?.trim() || null,
              productInterest: s.productInterest?.trim() || null,
              nextAction: hasNext ? s.nextAction?.trim() || null : null,
              nextActionDue: hasNext && s.nextActionDue ? new Date(`${s.nextActionDue}T00:00:00+07:00`) : null,
              nextActionOwnerId: hasNext ? (s.nextActionOwnerId && validOwners.has(s.nextActionOwnerId) ? s.nextActionOwnerId : trip.employeeId) : null,
              nextActionDoneAt: null,
              ...(s.checkin
                ? { checkinLat: s.checkin.lat, checkinLng: s.checkin.lng, checkinAccuracyM: Math.round(s.checkin.accuracyM), checkinAt: now }
                : {}),
            },
          });
        }
        return tx.businessTripRequest.update({
          where: { id: params.id },
          // Quản trị viên nộp hộ = chính người duyệt -> duyệt luôn.
          data: {
            status: canApprove ? "APPROVED" : "REPORTED",
            reportedAt: now,
            rejectReason: null,
            ...(canApprove ? { approvedById: session.user.id, approvedAt: now } : { approvedById: null, approvedAt: null }),
          },
        });
      });

      if (!canApprove) {
        await notifyAdmins({
          type: "TRIP_REVIEW_PENDING",
          title: "Báo cáo công tác chờ duyệt",
          message: `${trip.employee.name} vừa nộp báo cáo buổi đi ngày ${trip.visitDate.toISOString().slice(0, 10).split("-").reverse().join("/")}.`,
          link: "/business-trips",
        });
      }
      return NextResponse.json({ trip: updated });
    }

    // approve/reject/revise — chỉ ADMIN.
    if (!canApprove) throw new ForbiddenError("Chỉ quản trị hệ thống được duyệt báo cáo công tác");

    const dayLabel = trip.visitDate.toISOString().slice(0, 10).split("-").reverse().join("/");

    if (action === "approve") {
      if (trip.status !== "REPORTED") {
        return NextResponse.json({ error: "Chỉ duyệt được báo cáo đã nộp (chờ duyệt)" }, { status: 400 });
      }
      const updated = await prisma.businessTripRequest.update({
        where: { id: params.id },
        data: { status: "APPROVED", approvedById: session.user.id, approvedAt: new Date(), rejectReason: null },
      });
      await notifyUser(trip.employeeId, {
        type: "TRIP_REVIEWED",
        title: "Báo cáo công tác đã được duyệt",
        message: `Buổi đi ngày ${dayLabel} đã được duyệt và tính vào Kế hoạch tuần/KPI.`,
        link: "/business-trips",
      });
      return NextResponse.json({ trip: updated });
    }

    if (action === "revise") {
      if (trip.status !== "REPORTED") {
        return NextResponse.json({ error: "Chỉ trả lại được báo cáo đang chờ duyệt" }, { status: 400 });
      }
      if (!parsed.data.rejectReason) {
        return NextResponse.json({ error: "Cần ghi lý do yêu cầu bổ sung" }, { status: 400 });
      }
      const updated = await prisma.businessTripRequest.update({
        where: { id: params.id },
        data: { status: "NEEDS_REVISION", rejectReason: parsed.data.rejectReason },
      });
      await notifyUser(trip.employeeId, {
        type: "TRIP_REVIEWED",
        title: "Báo cáo công tác cần bổ sung",
        message: `Buổi đi ngày ${dayLabel}: ${parsed.data.rejectReason}`,
        link: "/business-trips",
      });
      return NextResponse.json({ trip: updated });
    }

    // reject
    if (trip.status === "APPROVED" || trip.status === "REJECTED") {
      return NextResponse.json({ error: "Đăng ký này đã được xử lý" }, { status: 400 });
    }
    const updated = await prisma.businessTripRequest.update({
      where: { id: params.id },
      data: { status: "REJECTED", approvedById: session.user.id, approvedAt: new Date(), rejectReason: parsed.data.rejectReason || null },
    });
    await notifyUser(trip.employeeId, {
      type: "TRIP_REVIEWED",
      title: "Báo cáo công tác bị từ chối",
      message: `Buổi đi ngày ${dayLabel} không được ghi nhận${parsed.data.rejectReason ? `: ${parsed.data.rejectReason}` : "."}`,
      link: "/business-trips",
    });
    return NextResponse.json({ trip: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("business-trips/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được đăng ký" }, { status: 500 });
  }
}
