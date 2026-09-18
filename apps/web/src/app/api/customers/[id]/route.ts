import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { computeDueDateFromTerm, PaymentTerm } from "@/lib/customer-payment-term";
import { z } from "zod";

export const dynamic = "force-dynamic";

const updateSchema = z.object({
  customerName: z.string().trim().min(1).optional(),
  contactPerson: z.string().trim().max(255).optional().nullable(),
  salesEmployeeId: z.string().trim().min(1).optional().nullable(),
  paymentTermType: z.enum(["DAYS_FROM_INVOICE", "END_OF_MONTH_OFFSET"]).optional().nullable(),
  paymentTermDays: z.number().int().min(0).optional().nullable(),
  paymentTermMonthOffset: z.number().int().min(0).optional().nullable(),
  // true = sau khi lưu quy tắc, tính lại dueDate cho mọi hoá đơn công nợ CHƯA có hạn thanh toán
  // của khách này (không đụng hoá đơn đã có hạn — dù tự tính trước đó hay admin tự điền tay).
  recomputeDueDates: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const target = await prisma.customer.findUnique({ where: { id: params.id } });
    if (!target) return NextResponse.json({ error: "Không tìm thấy khách hàng" }, { status: 404 });

    const { recomputeDueDates, ...fields } = parsed.data;
    const data: Record<string, unknown> = {};
    if (fields.customerName !== undefined) data.customerName = fields.customerName;
    if (fields.contactPerson !== undefined) data.contactPerson = fields.contactPerson || null;
    if (fields.salesEmployeeId !== undefined) data.salesEmployeeId = fields.salesEmployeeId || null;
    if (fields.paymentTermType !== undefined) {
      data.paymentTermType = fields.paymentTermType || null;
      data.paymentTermDays = fields.paymentTermType === "DAYS_FROM_INVOICE" ? fields.paymentTermDays ?? null : null;
      data.paymentTermMonthOffset = fields.paymentTermType === "END_OF_MONTH_OFFSET" ? fields.paymentTermMonthOffset ?? null : null;
    } else {
      if (fields.paymentTermDays !== undefined) data.paymentTermDays = fields.paymentTermDays;
      if (fields.paymentTermMonthOffset !== undefined) data.paymentTermMonthOffset = fields.paymentTermMonthOffset;
    }

    const customer = await prisma.customer.update({ where: { id: params.id }, data });

    let recomputedCount = 0;
    if (recomputeDueDates && customer.paymentTermType) {
      const invoices = await prisma.debtInvoice.findMany({
        where: { customerCode: customer.customerCode, dueDate: null, invoiceDate: { not: null } },
        select: { id: true, invoiceDate: true },
      });
      for (const inv of invoices) {
        const dueDate = computeDueDateFromTerm(inv.invoiceDate, customer as PaymentTerm);
        if (!dueDate) continue;
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
    await requireAdmin();
    await prisma.customer.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("customers/[id] DELETE error", err);
    return NextResponse.json({ error: "Không xoá được khách hàng" }, { status: 500 });
  }
}
