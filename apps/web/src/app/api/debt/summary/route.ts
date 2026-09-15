import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { remainingAmount, computeDebtStatus, mondayOfWeek } from "@/lib/debt-status";

export const dynamic = "force-dynamic";

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const month = Number(searchParams.get("month")) || now.getMonth() + 1; // 1-12

    const where: Prisma.DebtInvoiceWhereInput = { ...scopeByOwner(session, "salesEmployeeId") };

    const invoices = await prisma.debtInvoice.findMany({
      where,
      select: {
        originalAmount: true,
        paidAmount: true,
        dueDate: true,
        expectedPaymentDate: true,
        salesEmployeeId: true,
        salesEmployee: { select: { name: true } },
      },
    });

    let totalOriginal = 0;
    let totalPaid = 0;
    let totalDebt = 0;
    let overdueDebt = 0;
    let badDebt = 0;

    const perEmployee = new Map<string, { employeeId: string; employeeName: string; totalDebt: number; overdueDebt: number; badDebt: number }>();

    for (const inv of invoices) {
      const original = Number(inv.originalAmount);
      const paid = Number(inv.paidAmount);
      const remaining = remainingAmount(original, paid);
      totalOriginal += original;
      totalPaid += paid;
      totalDebt += remaining;
      const status = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid });
      if (status === "OVERDUE" || status === "BAD_DEBT") overdueDebt += remaining;
      if (status === "BAD_DEBT") badDebt += remaining;

      if (session.user.role === "ADMIN" && inv.salesEmployeeId) {
        const key = inv.salesEmployeeId;
        const entry = perEmployee.get(key) ?? {
          employeeId: key,
          employeeName: inv.salesEmployee?.name ?? "—",
          totalDebt: 0,
          overdueDebt: 0,
          badDebt: 0,
        };
        entry.totalDebt += remaining;
        if (status === "OVERDUE" || status === "BAD_DEBT") entry.overdueDebt += remaining;
        if (status === "BAD_DEBT") entry.badDebt += remaining;
        perEmployee.set(key, entry);
      }
    }

    // Kế hoạch thu theo tuần dương lịch (Thứ 2 - Chủ nhật) trong tháng được chọn — cộng remaining
    // của các hoá đơn có NVKD điền expectedPaymentDate rơi vào đúng tuần đó. Tối đa 5 tuần chồng
    // lên 1 tháng (cùng số cột "Tuần 1-5" như file Công nợ gốc anh Quân gửi).
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const weeks: { weekIndex: number; start: Date; end: Date; amount: number }[] = [];
    let cursor = mondayOfWeek(monthStart);
    let weekIndex = 1;
    while (cursor <= monthEnd && weekIndex <= 5) {
      weeks.push({ weekIndex, start: cursor, end: addDays(cursor, 6), amount: 0 });
      cursor = addDays(cursor, 7);
      weekIndex++;
    }
    for (const inv of invoices) {
      if (!inv.expectedPaymentDate) continue;
      const remaining = remainingAmount(Number(inv.originalAmount), Number(inv.paidAmount));
      if (remaining <= 0) continue;
      const d = new Date(inv.expectedPaymentDate);
      const bucket = weeks.find((w) => d >= w.start && d <= w.end);
      if (bucket) bucket.amount += remaining;
    }

    return NextResponse.json({
      totalOriginal,
      totalPaid,
      totalDebt,
      overdueDebt,
      badDebt,
      overdueRate: totalDebt > 0 ? overdueDebt / totalDebt : 0,
      badDebtRate: totalDebt > 0 ? badDebt / totalDebt : 0,
      recoveryRate: totalOriginal > 0 ? totalPaid / totalOriginal : 0,
      perEmployee: session.user.role === "ADMIN" ? Array.from(perEmployee.values()) : null,
      weeklyPlan: weeks.map((w) => ({ weekIndex: w.weekIndex, start: w.start, end: w.end, amount: w.amount })),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/summary GET error", err);
    return NextResponse.json({ error: "Không tải được tổng kết công nợ" }, { status: 500 });
  }
}
