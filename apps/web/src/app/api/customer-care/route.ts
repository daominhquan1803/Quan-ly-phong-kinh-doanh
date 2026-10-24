import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError } from "@/lib/rbac";
import { careLogSchema, normalizeCareLog } from "@/lib/customer-care";
import { lostMessages } from "@/lib/customer-care-alerts";

export const dynamic = "force-dynamic";

/** Lịch sử chăm sóc của 1 khách (mới nhất trước). SALES chỉ xem khách của mình. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const customerId = new URL(req.url).searchParams.get("customerId");
    if (!customerId) return NextResponse.json({ error: "Thiếu customerId" }, { status: 400 });
    const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { salesEmployeeId: true } });
    if (!customer || (session.user.role !== "ADMIN" && customer.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }
    const logs = await prisma.customerCareLog.findMany({
      where: { customerId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { employee: { select: { id: true, name: true } }, photos: { select: { id: true } } },
    });
    return NextResponse.json({ logs });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care GET error", err);
    return NextResponse.json({ error: "Không tải được lịch sử chăm sóc" }, { status: 500 });
  }
}

/** Ghi nhanh 1 lần chăm sóc. SALES chỉ ghi cho khách của mình; ADMIN ghi cho mọi khách. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const parsed = careLogSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const customer = await prisma.customer.findUnique({
      where: { id: parsed.data.customerId },
      select: { id: true, salesEmployeeId: true },
    });
    if (!customer || (session.user.role !== "ADMIN" && customer.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }
    // Ảnh phải do chính người ghi tải lên và chưa gắn vào lần ghi nào.
    const photoIds = Array.from(new Set(parsed.data.photoIds));
    const own = await prisma.careLogPhoto.count({ where: { id: { in: photoIds }, uploaderId: session.user.id, logId: null } });
    if (own !== photoIds.length) return NextResponse.json({ error: "Ảnh đính kèm không hợp lệ, hãy tải lại ảnh" }, { status: 400 });
    const data = normalizeCareLog(parsed.data, new Date());
    const log = await prisma.customerCareLog.create({
      data: { ...data, employeeId: session.user.id, photos: { connect: photoIds.map((id) => ({ id })) } },
    });
    if (log.outcome === "LOST") {
      // Mất khách: báo trưởng phòng NGAY (Zalo bot gửi trong ~1 phút). Lỗi báo không làm hỏng việc ghi.
      try {
        const [c, managers] = await Promise.all([
          prisma.customer.findUnique({ where: { id: log.customerId }, select: { customerCode: true, customerName: true } }),
          prisma.user.findMany({ where: { role: "ADMIN", accessLevel: "FULL", active: true }, select: { id: true } }),
        ]);
        if (c && managers.length) {
          await prisma.notification.createMany({ data: lostMessages(managers.map((m) => m.id), log.customerId, log.id, c, session.user.name ?? "NVKD", log.note) });
        }
      } catch (e) {
        console.error("customer-care LOST notify error", e);
      }
    }
    return NextResponse.json({ log }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customer-care POST error", err);
    return NextResponse.json({ error: "Không lưu được ghi chú chăm sóc" }, { status: 500 });
  }
}
