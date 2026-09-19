import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { remainingAmount } from "@/lib/debt-status";
import { z } from "zod";

export const dynamic = "force-dynamic";

const MANUAL_PREFIX = "manual:";

function parseDateOnlyLocal(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Lịch sử tiền về của 1 hoá đơn (cả tiền về từ file "Tiền về" lẫn nhập tay) — chỉ Quản trị viên. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const invoice = await prisma.debtInvoice.findUnique({
      where: { id: params.id },
      select: { originalAmount: true, paidAmount: true },
    });
    if (!invoice) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });

    const allocations = await prisma.debtPaymentAllocation.findMany({
      where: { invoiceId: params.id },
      include: { payment: { select: { id: true, paymentDate: true, note: true, rawDescription: true, sourceHash: true } } },
    });
    const payments = allocations
      .map((a) => ({
        allocationId: a.id,
        paymentId: a.payment.id,
        amount: Number(a.amount),
        paymentDate: a.payment.paymentDate,
        isManual: a.payment.sourceHash.startsWith(MANUAL_PREFIX),
        note: a.payment.note,
        description: a.payment.rawDescription,
      }))
      .sort((x, y) => (y.paymentDate?.getTime() ?? 0) - (x.paymentDate?.getTime() ?? 0));

    return NextResponse.json({
      originalAmount: Number(invoice.originalAmount),
      paidAmount: Number(invoice.paidAmount),
      remaining: remainingAmount(Number(invoice.originalAmount), Number(invoice.paidAmount)),
      payments,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/[id]/payments GET error", err);
    return NextResponse.json({ error: "Không tải được lịch sử tiền về" }, { status: 500 });
  }
}

const createSchema = z.object({
  amount: z.number().positive("Số tiền phải lớn hơn 0"),
  paymentDate: z.string().min(1, "Thiếu ngày tiền về"),
  note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Quản trị viên nhập TAY tiền về cho 1 hoá đơn — dùng khi khoản đã thanh toán thật nhưng dữ liệu
 * gốc/file "Tiền về" chưa cập nhật. Đi đúng luồng của file Tiền về: tạo DebtPayment + 1
 * DebtPaymentAllocation (matchMethod "MANUAL") + cộng paidAmount, nên "Đã thu"/ngày tiền về trong
 * Kế hoạch thu, trạng thái hoá đơn, tỉ lệ thu hồi đều tự cập nhật.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await requireAdmin();
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }
    const paymentDate = parseDateOnlyLocal(parsed.data.paymentDate);
    if (!paymentDate) return NextResponse.json({ error: "Ngày tiền về không hợp lệ" }, { status: 400 });

    const invoice = await prisma.debtInvoice.findUnique({ where: { id: params.id } });
    if (!invoice) return NextResponse.json({ error: "Không tìm thấy hoá đơn" }, { status: 404 });

    const remaining = remainingAmount(Number(invoice.originalAmount), Number(invoice.paidAmount));
    if (parsed.data.amount > remaining + 0.5) {
      return NextResponse.json(
        { error: `Số tiền vượt quá số còn phải thu (${remaining.toLocaleString("vi-VN")}đ)` },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const payment = await tx.debtPayment.create({
        data: {
          paymentDate,
          customerCode: invoice.customerCode,
          customerName: invoice.customerName,
          rawDescription: `Nhập tay bởi ${session.user.name ?? "Quản trị viên"}`,
          amount: parsed.data.amount,
          note: parsed.data.note || null,
          matchStatus: "MATCHED",
          sourceHash: `${MANUAL_PREFIX}${randomUUID()}`,
        },
      });
      await tx.debtPaymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: invoice.id, amount: parsed.data.amount, matchMethod: "MANUAL" },
      });
      await tx.debtInvoice.update({ where: { id: invoice.id }, data: { paidAmount: { increment: parsed.data.amount } } });
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/[id]/payments POST error", err);
    return NextResponse.json({ error: "Không ghi nhận được tiền về" }, { status: 500 });
  }
}
