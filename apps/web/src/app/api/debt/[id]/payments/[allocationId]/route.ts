import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** Xoá 1 khoản tiền về NHẬP TAY (nhập nhầm/trùng với file Tiền về nhập sau) — hoàn lại paidAmount.
 * Khoản từ file "Tiền về" không xoá ở đây (thuộc luồng nhập file). Chỉ Quản trị viên. */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; allocationId: string } }) {
  try {
    await requireAdmin();
    const alloc = await prisma.debtPaymentAllocation.findUnique({
      where: { id: params.allocationId },
      include: { payment: { select: { id: true, sourceHash: true } } },
    });
    if (!alloc || alloc.invoiceId !== params.id) {
      return NextResponse.json({ error: "Không tìm thấy khoản tiền về" }, { status: 404 });
    }
    if (!alloc.payment.sourceHash.startsWith("manual:")) {
      return NextResponse.json({ error: "Chỉ xoá được khoản tiền về nhập tay" }, { status: 400 });
    }

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.debtInvoice.findUniqueOrThrow({ where: { id: params.id }, select: { paidAmount: true } });
      const newPaid = Math.max(0, Number(invoice.paidAmount) - Number(alloc.amount));
      await tx.debtInvoice.update({ where: { id: params.id }, data: { paidAmount: newPaid } });
      await tx.debtPayment.delete({ where: { id: alloc.payment.id } }); // cascade xoá allocation
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/[id]/payments/[allocationId] DELETE error", err);
    return NextResponse.json({ error: "Không xoá được khoản tiền về" }, { status: 500 });
  }
}
