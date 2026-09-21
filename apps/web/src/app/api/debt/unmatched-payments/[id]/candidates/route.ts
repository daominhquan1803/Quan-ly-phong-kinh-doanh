import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { remainingAmount } from "@/lib/debt-status";

export const dynamic = "force-dynamic";

/**
 * Hoá đơn công nợ còn phải thu để gắn 1 khoản Tiền về chưa khớp vào: hoá đơn cùng mã khách với khoản tiền
 * về lên đầu, rồi tới kết quả tìm kiếm (tên/mã khách/số hoá đơn) — khách trong file Tiền về đôi khi ghi
 * mã/tên khác hoá đơn nên phải cho tìm tay.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const payment = await prisma.debtPayment.findUnique({ where: { id: params.id }, select: { customerCode: true } });
    if (!payment) return NextResponse.json({ error: "Không tìm thấy khoản tiền về" }, { status: 404 });

    const q = req.nextUrl.searchParams.get("q")?.trim();
    const or = [
      ...(payment.customerCode ? [{ customerCode: payment.customerCode }] : []),
      ...(q
        ? [
            { customerName: { contains: q, mode: "insensitive" as const } },
            { customerCode: { contains: q, mode: "insensitive" as const } },
            { invoiceNumber: { contains: q, mode: "insensitive" as const } },
          ]
        : []),
    ];
    if (or.length === 0) return NextResponse.json({ invoices: [] });

    const rows = await prisma.debtInvoice.findMany({
      where: { OR: or },
      orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
      take: 300,
    });
    const invoices = rows
      .map((r) => ({
        id: r.id,
        customerCode: r.customerCode,
        customerName: r.customerName,
        invoiceNumber: r.invoiceNumber,
        invoiceDate: r.invoiceDate,
        dueDate: r.dueDate,
        originalAmount: Number(r.originalAmount),
        remaining: remainingAmount(Number(r.originalAmount), Number(r.paidAmount)),
        sameCustomer: !!payment.customerCode && r.customerCode === payment.customerCode,
      }))
      .filter((r) => r.remaining > 0.5)
      .sort((a, b) => Number(b.sameCustomer) - Number(a.sameCustomer))
      .slice(0, 40);

    return NextResponse.json({ invoices });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/unmatched-payments/[id]/candidates GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách hoá đơn" }, { status: 500 });
  }
}
