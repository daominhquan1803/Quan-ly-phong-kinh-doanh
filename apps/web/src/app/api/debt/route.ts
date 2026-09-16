import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const employeeId = searchParams.get("employeeId");

    const where: Prisma.DebtInvoiceWhereInput = {
      ...scopeByOwner(session, "salesEmployeeId"),
    };
    if (employeeId && session.user.role === "ADMIN") where.salesEmployeeId = employeeId;
    if (q) {
      where.OR = [
        { customerName: { contains: q, mode: "insensitive" } },
        { customerCode: { contains: q, mode: "insensitive" } },
        { invoiceNumber: { contains: q, mode: "insensitive" } },
      ];
    }

    const invoices = await prisma.debtInvoice.findMany({
      where,
      include: {
        salesEmployee: { select: { id: true, name: true } },
        // Chỉ cần ngày thanh toán gần nhất để hiển thị hoá đơn đã trả hết — không trả cả danh
        // sách allocation cho client.
        allocations: { select: { payment: { select: { paymentDate: true } } } },
      },
      orderBy: [{ dueDate: "asc" }, { invoiceDate: "asc" }],
      // Bảng Công nợ lọc/sắp xếp ở client (trạng thái, nhân viên, tìm kiếm) nên trả toàn bộ danh
      // sách khớp phạm vi/tìm kiếm server, chặn ở mức cao để tránh phình dữ liệu bất thường
      // (cùng cách làm với /api/orders).
      take: 5000,
    });

    const result = invoices.map(({ allocations, ...invoice }) => {
      const paymentDates = allocations.map((a) => a.payment.paymentDate).filter((d): d is Date => d !== null);
      const lastPaymentDate = paymentDates.length > 0 ? new Date(Math.max(...paymentDates.map((d) => d.getTime()))) : null;
      return { ...invoice, lastPaymentDate };
    });

    return NextResponse.json({ invoices: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách công nợ" }, { status: 500 });
  }
}
