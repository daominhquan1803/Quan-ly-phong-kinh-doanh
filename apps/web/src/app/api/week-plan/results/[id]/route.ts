import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { z } from "zod";
import { contactInfoOf, entryDetailSchema, validateNewEntry } from "@/lib/week-plan-entry";
import { isWeekEntryLocked, weekLockedMessage, weekRange } from "@/lib/week-plan";

export const dynamic = "force-dynamic";

const patchSchema = entryDetailSchema.extend({
  entryDate: z.string().min(1),
  customerName: z.string().trim().min(1, "Thiếu tên khách hàng"),
  content: z.string().trim().max(1000).optional().nullable(),
  productInterest: z.string().trim().max(500).optional().nullable(),
});

/**
 * Sửa 1 dòng đã ghi (bổ sung thông tin còn thiếu, đổi ngày trong cùng tuần...) — chủ dòng hoặc ADMIN; NVKD bị khoá khi tuần quá hạn nhập.
 * Gửi đủ các trường của dòng (ghi đè). Đổi hành động tiếp theo / ngày hẹn thì nhắc lại theo ngày hẹn mới.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const entry = await prisma.weekPlanResultEntry.findUnique({ where: { id: params.id } });
    if (!entry) return NextResponse.json({ error: "Không tìm thấy dòng kết quả" }, { status: 404 });
    if (session.user.role !== "ADMIN" && entry.employeeId !== session.user.id) {
      throw new ForbiddenError("Không có quyền sửa dòng của người khác");
    }
    if (session.user.role !== "ADMIN" && isWeekEntryLocked(entry.weekStart)) {
      throw new ForbiddenError(weekLockedMessage(entry.weekStart));
    }
    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    const d = parsed.data;
    const entryDate = new Date(d.entryDate);
    if (Number.isNaN(entryDate.getTime())) return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
    const { start, end } = weekRange(entry.weekStart);
    if (entryDate < start || entryDate >= end) return NextResponse.json({ error: "Ngày ghi nhận phải nằm trong tuần của dòng này" }, { status: 400 });
    const invalid = validateNewEntry(entryDate, d.customerName, d);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const nextActionAt = d.nextActionAt ? new Date(d.nextActionAt) : null;
    const nextAction = d.nextAction?.trim() || null;
    const followUpChanged = nextAction !== entry.nextAction || nextActionAt?.getTime() !== entry.nextActionAt?.getTime();
    const contactName = d.contactName?.trim() || null;
    const contactPhone = d.contactPhone?.trim() || null;
    const updated = await prisma.weekPlanResultEntry.update({
      where: { id: params.id },
      data: {
        entryDate,
        customerName: d.customerName.trim(),
        address: d.address?.trim() || null,
        nationality: d.nationality ?? null,
        scale: d.scale ?? null,
        contactName,
        contactPhone,
        contactInfo: contactInfoOf(contactName, contactPhone) ?? entry.contactInfo,
        need: d.need?.trim() || null,
        workDone: d.workDone?.trim() || null,
        nextAction,
        nextActionAt,
        content: d.content?.trim() || null,
        productInterest: d.productInterest?.trim() || null,
        ...(followUpChanged ? { followUpNotifiedAt: null } : {}),
      },
    });
    return NextResponse.json({ entry: updated });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("week-plan results PATCH error", err);
    return NextResponse.json({ error: "Không lưu được dòng kết quả" }, { status: 500 });
  }
}

/** Xoá 1 dòng kết quả đã ghi nhầm — chủ dòng hoặc ADMIN mới được xoá. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const entry = await prisma.weekPlanResultEntry.findUnique({ where: { id: params.id } });
    if (!entry) return NextResponse.json({ error: "Không tìm thấy dòng kết quả" }, { status: 404 });
    if (session.user.role !== "ADMIN" && entry.employeeId !== session.user.id) {
      throw new ForbiddenError("Không có quyền xoá dòng của người khác");
    }
    if (session.user.role !== "ADMIN" && isWeekEntryLocked(entry.weekStart)) {
      throw new ForbiddenError(weekLockedMessage(entry.weekStart));
    }
    await prisma.weekPlanResultEntry.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("week-plan results DELETE error", err);
    return NextResponse.json({ error: "Không xoá được dòng kết quả" }, { status: 500 });
  }
}
