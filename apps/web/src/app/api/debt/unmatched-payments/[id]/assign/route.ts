import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { remainingAmount } from "@/lib/debt-status";
import { planAssign } from "@/lib/debt-unmatched-assign";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  invoiceId: z.string().min(1, "Chọn hoá đơn cần gắn"),
  amount: z.number().positive().optional(),
  // yyyy-mm-dd — sửa ngày tiền về nếu file ghi sai (vd năm 2027/2028).
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

/**
 * Gắn 1 khoản Tiền về chưa khớp vào 1 hoá đơn công nợ đang có — đi đúng luồng của file Tiền về: tạo
 * DebtPaymentAllocation (matchMethod "MANUAL_ASSIGN") + cộng paidAmount của hoá đơn, và cập nhật trạng
 * thái khoản tiền về (MATCHED khi gắn hết, PARTIAL nếu còn dư).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const { invoiceId, amount: requested, paymentDate } = parsed.data;

    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.debtPayment.findUnique({ where: { id: params.id }, include: { allocations: { select: { amount: true } } } });
      if (!payment) return { status: 404, error: "Không tìm thấy khoản tiền về" } as const;
      if (payment.matchStatus !== "UNMATCHED" && payment.matchStatus !== "PARTIAL") {
        return { status: 409, error: "Khoản tiền về này đã được xử lý rồi" } as const;
      }
      const invoice = await tx.debtInvoice.findUnique({ where: { id: invoiceId } });
      if (!invoice) return { status: 404, error: "Không tìm thấy hoá đơn" } as const;

      const unallocated = Number(payment.amount) - payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
      const plan = planAssign(unallocated, remainingAmount(Number(invoice.originalAmount), Number(invoice.paidAmount)), requested);
      if (!plan.ok) return { status: 400, error: plan.error } as const;

      await tx.debtPaymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: invoice.id, amount: plan.amount, matchMethod: "MANUAL_ASSIGN" },
      });
      await tx.debtInvoice.update({ where: { id: invoice.id }, data: { paidAmount: { increment: plan.amount } } });
      await tx.debtPayment.update({
        where: { id: payment.id },
        data: {
          matchStatus: plan.newStatus,
          ...(paymentDate ? { paymentDate: new Date(`${paymentDate}T00:00:00+07:00`) } : {}),
        },
      });
      return { status: 200, amount: plan.amount, newStatus: plan.newStatus } as const;
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, amount: result.amount, matchStatus: result.newStatus });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/unmatched-payments/[id]/assign POST error", err);
    return NextResponse.json({ error: "Không gắn được khoản tiền về" }, { status: 500 });
  }
}
