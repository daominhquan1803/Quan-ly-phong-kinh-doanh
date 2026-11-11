import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { DELAY_CATEGORIES } from "@/lib/admin-kpi";

export const dynamic = "force-dynamic";

const schema = z.object({
  lineId: z.string().min(1),
  category: z.enum(Object.keys(DELAY_CATEGORIES) as [string, ...string[]], { errorMap: () => ({ message: "Chọn lý do giao trễ" }) }),
  note: z.string().trim().max(1000).optional().nullable(),
  // Ngày khách hẹn mới (yyyy-mm-dd) — bắt buộc khi lý do là "Khách đổi lịch", bỏ qua với lý do khác.
  newDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày hẹn mới không hợp lệ").optional().nullable(),
});

/** Admin nhập (hoặc sửa) lý do giao trễ cho 1 dòng PO — sửa lại thì về trạng thái chờ duyệt. */
export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const { lineId, category, note, newDeliveryDate } = parsed.data;
    if (category === "KHACH_DOI_LICH" && !newDeliveryDate) {
      return NextResponse.json({ error: "Chọn ngày khách hẹn mới khi lý do là Khách đổi lịch" }, { status: 400 });
    }
    const line = await prisma.poTrackingLine.findUnique({ where: { id: lineId }, select: { id: true } });
    if (!line) return NextResponse.json({ error: "Không tìm thấy dòng PO" }, { status: 404 });
    // 00:00 giờ Việt Nam của ngày đã chọn (cùng quy ước với các hạn giao khác); lý do khác thì xoá ngày hẹn mới.
    const newDate = category === "KHACH_DOI_LICH" && newDeliveryDate ? new Date(`${newDeliveryDate}T00:00:00+07:00`) : null;
    // "Khách đổi lịch" là việc admin làm trực tiếp với kho và giao hàng nên có hiệu lực NGAY, không chờ Trưởng phòng duyệt
    // (anh Quân chốt 11/11/2026). Các lý do khác vẫn chờ duyệt như cũ. Trưởng phòng vẫn có thể bấm "Không duyệt" để thu hồi.
    const autoApproved = category === "KHACH_DOI_LICH";
    const data = {
      category,
      note: note || null,
      newDeliveryDate: newDate,
      status: autoApproved ? ("APPROVED" as const) : ("PENDING" as const),
      reviewedById: null,
      reviewedAt: autoApproved ? new Date() : null,
      reviewNote: autoApproved ? "Khách đổi lịch — không cần duyệt" : null,
    };
    const reason = await prisma.deliveryDelayReason.upsert({
      where: { lineId },
      create: { lineId, ...data, createdById: session.user.id },
      update: data,
    });
    return NextResponse.json({ reason }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("kpi-admin delay-reasons POST error", err);
    return NextResponse.json({ error: "Không lưu được lý do" }, { status: 500 });
  }
}
