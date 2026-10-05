import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Chuyển 1 khoản tiền về của hoá đơn về "CHƯA VỀ" (nhập nhầm/khớp sai) — hoàn lại paidAmount. Chỉ
 * Quản trị viên.
 * - Khoản NHẬP TAY: xoá hẳn khoản tiền về (không còn nguồn nào khác).
 * - Khoản từ file "Tiền về": là tiền THẬT vào tài khoản nên KHÔNG xoá — chỉ gỡ phần đã gán vào hoá
 *   đơn này; khoản tiền chuyển về trạng thái chưa khớp (UNMATCHED/PARTIAL) và hiện ở mục "Tiền về
 *   chưa khớp công nợ" để gắn lại đúng hoá đơn hoặc xoá. Hash nguồn giữ nguyên nên up lại file
 *   không tự khớp lại sai như cũ.
 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string; allocationId: string } }) {
  try {
    await requireAdmin();
    const alloc = await prisma.debtPaymentAllocation.findUnique({
      where: { id: params.allocationId },
      include: { payment: { select: { id: true, sourceHash: true, amount: true } } },
    });
    if (!alloc || alloc.invoiceId !== params.id) {
      return NextResponse.json({ error: "Không tìm thấy khoản tiền về" }, { status: 404 });
    }
    const isManual = alloc.payment.sourceHash.startsWith("manual:");

    await prisma.$transaction(async (tx) => {
      const invoice = await tx.debtInvoice.findUniqueOrThrow({ where: { id: params.id }, select: { paidAmount: true } });
      const newPaid = Math.max(0, Number(invoice.paidAmount) - Number(alloc.amount));
      await tx.debtInvoice.update({ where: { id: params.id }, data: { paidAmount: newPaid } });

      if (isManual) {
        await tx.debtPayment.delete({ where: { id: alloc.payment.id } }); // cascade xoá allocation
        return;
      }
      await tx.debtPaymentAllocation.delete({ where: { id: alloc.id } });
      const rest = await tx.debtPaymentAllocation.aggregate({
        where: { paymentId: alloc.payment.id },
        _sum: { amount: true },
      });
      const allocated = Number(rest._sum.amount ?? 0);
      const matchStatus = allocated <= 0 ? "UNMATCHED" : allocated + 0.5 < Number(alloc.payment.amount) ? "PARTIAL" : "MATCHED";
      await tx.debtPayment.update({ where: { id: alloc.payment.id }, data: { matchStatus } });
    });

    return NextResponse.json({ ok: true, movedToUnmatched: !isManual });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/[id]/payments/[allocationId] DELETE error", err);
    return NextResponse.json({ error: "Không chuyển được khoản tiền về" }, { status: 500 });
  }
}
