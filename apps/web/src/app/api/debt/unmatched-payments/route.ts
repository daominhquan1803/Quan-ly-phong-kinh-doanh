import { NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * Danh sách "Tiền về" chưa khớp hết vào công nợ (UNMATCHED: không rõ khách hàng nào có hoá đơn
 * khớp; PARTIAL: khớp được 1 phần, còn dư tiền không biết gán vào đâu) — tiền THẬT đã về nhưng
 * NẰM NGOÀI kế hoạch/công nợ đang theo dõi, cần admin xem lại và xử lý tay (vd đặt cọc trước khi
 * có hoá đơn, khách mới chưa có trong hệ thống, ghi nhầm mã khách hàng...). Chỉ ADMIN xem được vì
 * không gắn được với nhân viên cụ thể nào (DebtPayment không có salesEmployeeId).
 */
export async function GET() {
  try {
    await requireAdmin();

    const payments = await prisma.debtPayment.findMany({
      where: { matchStatus: { in: ["UNMATCHED", "PARTIAL"] } },
      include: { allocations: { select: { amount: true } } },
      orderBy: { paymentDate: "desc" },
      take: 500,
    });

    const result = payments.map(({ allocations, ...p }) => {
      const allocated = allocations.reduce((s, a) => s + Number(a.amount), 0);
      return { ...p, unallocatedAmount: Number(p.amount) - allocated };
    });

    return NextResponse.json({ payments: result });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/unmatched-payments GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách Tiền về chưa khớp" }, { status: 500 });
  }
}
