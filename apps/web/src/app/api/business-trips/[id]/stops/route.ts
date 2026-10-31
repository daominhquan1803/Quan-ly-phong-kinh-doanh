import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireSession, ForbiddenError, UnauthorizedError } from "@/lib/rbac";
import { effectiveAddresses } from "@/lib/customer-address";
import { notifyUser } from "@/lib/business-trip-notify";
import { joinDenied } from "@/lib/trip-join";
import { normalizeVN } from "@/lib/text-normalize";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  customerId: z.string().trim().min(1, "Thiếu khách hàng"),
  /** NVKD đi gặp khách này; không có = người bấm */
  attendeeId: z.string().trim().min(1).optional().nullable(),
});

/**
 * Thêm 1 khách (từ bảng gợi ý ở đầu trang Đăng ký công tác) vào chuyến công tác của đồng nghiệp: tham gia, nhờ đi hộ hoặc nhận khách chưa
 * phân — quyền xem lib/trip-join.ts. Chỉ chuyến chưa nộp báo cáo (PENDING) và chưa qua ngày đi. Khách chưa phân được gán cho người đi gặp.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const callerId = session.user.id;
    const attendeeId = parsed.data.attendeeId || callerId;

    const trip = await prisma.businessTripRequest.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        employeeId: true,
        status: true,
        visitDate: true,
        provinces: true,
        employee: { select: { name: true } },
        stops: { select: { orderIndex: true, customerId: true, companyName: true } },
      },
    });
    if (!trip) return NextResponse.json({ error: "Không tìm thấy chuyến công tác" }, { status: 404 });
    const todayStart = new Date(`${new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)}T00:00:00+07:00`);
    if (trip.status !== "PENDING" || trip.visitDate < todayStart) {
      return NextResponse.json({ error: "Chuyến đã qua ngày đi hoặc đã nộp báo cáo, không thêm khách được nữa" }, { status: 400 });
    }

    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
      select: { id: true, customerCode: true, customerName: true, address: true, salesEmployeeId: true },
    });
    if (!customer) return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });

    const denied = joinDenied({ callerId, isAdmin: session.user.role === "ADMIN", tripOwnerId: trip.employeeId, customerOwnerId: customer.salesEmployeeId, attendeeId });
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const name = normalizeVN(customer.customerName);
    const dup = trip.stops.some((s) => s.customerId === customer.id || normalizeVN(s.companyName) === name);
    if (dup) return NextResponse.json({ error: "Khách này đã có trong chuyến" }, { status: 409 });

    if (attendeeId !== callerId) {
      const person = await prisma.user.findFirst({ where: { id: attendeeId, active: true }, select: { id: true } });
      if (!person) return NextResponse.json({ error: "NVKD được nhờ đi không hợp lệ" }, { status: 400 });
    }

    const address = (await effectiveAddresses([customer])).get(customer.id) ?? null;
    const claim = customer.salesEmployeeId == null; // khách chưa phân -> gán cho người đi gặp
    const nextIndex = Math.max(0, ...trip.stops.map((s) => s.orderIndex)) + 1;
    const stop = await prisma.$transaction(async (tx) => {
      if (claim) await tx.customer.update({ where: { id: customer.id }, data: { salesEmployeeId: attendeeId } });
      return tx.businessTripStop.create({
        data: {
          tripId: trip.id,
          orderIndex: nextIndex,
          companyName: customer.customerName,
          address,
          content: "Thăm hỏi, chăm sóc khách (thêm từ gợi ý khách trong tỉnh)",
          customerId: customer.id,
          attendeeId,
          addedById: callerId,
        },
      });
    });

    // Báo người liên quan (mỗi người 1 thông báo): người đi gặp, người đăng ký chuyến, chủ khách — trừ người vừa bấm.
    const who = session.user.name ?? "Đồng nghiệp";
    const day = new Date(trip.visitDate.getTime() + 7 * 3600_000).toISOString();
    const dm = `${day.slice(8, 10)}/${day.slice(5, 7)}`;
    const msgs = new Map<string, string>();
    if (attendeeId !== callerId) msgs.set(attendeeId, `${who} nhờ bạn đi gặp ${customer.customerName} trong chuyến công tác ngày ${dm} của ${trip.employee.name}.`);
    if (trip.employeeId !== callerId && !msgs.has(trip.employeeId)) msgs.set(trip.employeeId, `${who} thêm khách ${customer.customerName} vào chuyến công tác ngày ${dm} của bạn.`);
    if (customer.salesEmployeeId && customer.salesEmployeeId !== callerId && !msgs.has(customer.salesEmployeeId)) {
      msgs.set(customer.salesEmployeeId, `${who} thêm khách ${customer.customerName} của bạn vào chuyến công tác ngày ${dm} của ${trip.employee.name}.`);
    }
    for (const [userId, message] of msgs) await notifyUser(userId, { type: "TRIP_ASSIGNED", title: "Khách được thêm vào chuyến công tác", message, link: "/business-trips" });

    return NextResponse.json({ stop }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("business-trips/[id]/stops POST error", err);
    return NextResponse.json({ error: "Không thêm được khách vào chuyến" }, { status: 500 });
  }
}
