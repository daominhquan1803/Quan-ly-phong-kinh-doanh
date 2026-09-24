import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireSession, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { computeDueDateFromTerm, PaymentTerm } from "@/lib/customer-payment-term";
import { emailListField, normalizeEmailList } from "@/lib/debt-reminder";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  customerName: z.string().trim().min(1).optional(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  email: emailListField,
  // Số lần NVKD đã tự nhắc nợ quá hạn thủ công cho khách này TRƯỚC khi dùng hệ thống — xem
  // Customer.manualOverdueReminderBase trong schema.prisma. 0 có nghĩa riêng (GIẢ ĐỊNH 14).
  manualOverdueReminderBase: z.number().int().min(0).max(999).optional().nullable(),
  salesEmployeeId: z.string().trim().min(1).optional().nullable(),
  paymentTermType: z.enum(["DAYS_FROM_INVOICE", "END_OF_MONTH_OFFSET"]).optional().nullable(),
  paymentTermDays: z.number().int().min(0).optional().nullable(),
  paymentTermMonthOffset: z.number().int().min(0).optional().nullable(),
  // true = tính lại dueDate cho mọi hoá đơn công nợ còn nợ của khách này theo quy tắc hiện tại (đổi
  // quy tắc cũng tự làm việc này — xem PATCH bên dưới).
  recomputeDueDates: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const isAdmin = session.user.role === "ADMIN";
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const target = await prisma.customer.findUnique({ where: { id: params.id } });
    if (!target || (!isAdmin && target.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }

    const { recomputeDueDates, ...fields } = parsed.data;
    const data: Record<string, unknown> = {};
    if (fields.customerName !== undefined) data.customerName = fields.customerName;
    if (fields.contactPerson !== undefined) data.contactPerson = fields.contactPerson || null;
    if (fields.email !== undefined) data.email = normalizeEmailList(fields.email);
    if (fields.manualOverdueReminderBase !== undefined) data.manualOverdueReminderBase = fields.manualOverdueReminderBase;
    // Chỉ ADMIN được đổi NVKD phụ trách.
    if (isAdmin && fields.salesEmployeeId !== undefined) data.salesEmployeeId = fields.salesEmployeeId || null;
    if (fields.paymentTermType !== undefined) {
      data.paymentTermType = fields.paymentTermType || null;
      data.paymentTermDays = fields.paymentTermType === "DAYS_FROM_INVOICE" ? fields.paymentTermDays ?? null : null;
      data.paymentTermMonthOffset = fields.paymentTermType === "END_OF_MONTH_OFFSET" ? fields.paymentTermMonthOffset ?? null : null;
    } else {
      if (fields.paymentTermDays !== undefined) data.paymentTermDays = fields.paymentTermDays;
      if (fields.paymentTermMonthOffset !== undefined) data.paymentTermMonthOffset = fields.paymentTermMonthOffset;
    }

    const customer = await prisma.customer.update({ where: { id: params.id }, data });

    // Quy tắc hạn nợ của khách là nguồn chuẩn: đổi quy tắc (hoặc bấm "tính lại") thì áp lại hạn thanh
    // toán cho MỌI hoá đơn còn nợ của khách — kể cả hoá đơn đã có hạn từ file gốc/nhập tay trước đó
    // (anh Quân: sửa hạn công nợ ở trang Khách hàng phải đồng bộ sang trang Công nợ). Hoá đơn đã
    // thanh toán đủ giữ nguyên để không đổi lịch sử.
    const termChanged =
      customer.paymentTermType !== target.paymentTermType ||
      customer.paymentTermDays !== target.paymentTermDays ||
      customer.paymentTermMonthOffset !== target.paymentTermMonthOffset;
    let recomputedCount = 0;
    if ((recomputeDueDates || termChanged) && customer.paymentTermType) {
      const invoices = await prisma.debtInvoice.findMany({
        where: { customerCode: customer.customerCode, invoiceDate: { not: null } },
        select: { id: true, invoiceDate: true, dueDate: true, originalAmount: true, paidAmount: true },
      });
      for (const inv of invoices) {
        if (Number(inv.originalAmount) - Number(inv.paidAmount) <= 0) continue;
        const dueDate = computeDueDateFromTerm(inv.invoiceDate, customer as PaymentTerm);
        if (!dueDate || inv.dueDate?.getTime() === dueDate.getTime()) continue;
        await prisma.debtInvoice.update({ where: { id: inv.id }, data: { dueDate } });
        recomputedCount++;
      }
    }

    return NextResponse.json({ customer, recomputedCount });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/[id] PATCH error", err);
    return NextResponse.json({ error: "Không cập nhật được khách hàng" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireSession();
    const target = await prisma.customer.findUnique({ where: { id: params.id }, select: { salesEmployeeId: true } });
    if (!target || (session.user.role !== "ADMIN" && target.salesEmployeeId !== session.user.id)) {
      return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });
    }
    await prisma.customer.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/[id] DELETE error", err);
    return NextResponse.json({ error: "Không xoá được khách hàng" }, { status: 500 });
  }
}
