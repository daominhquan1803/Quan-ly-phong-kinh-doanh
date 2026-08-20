import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { z } from "zod";

export const dynamic = "force-dynamic";

const patchSchema = z.object({
  action: z.enum(["approve", "reject", "cancel"]),
  rejectReason: z.string().trim().max(500).optional(),
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

    if (action === "cancel") {
      // Chủ đăng ký tự huỷ khi còn chờ duyệt.
      if (trip.employeeId !== session.user.id) {
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
