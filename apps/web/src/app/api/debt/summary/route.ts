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

    // Kế hoạch thu theo tuần dương lịch (Thứ 2 - Chủ nhật) trong tháng được chọn — mỗi hoá đơn có
    // NVKD điền expectedPaymentDate được tính vào ĐÚNG tuần đó với TOÀN BỘ originalAmount (số đã
    // "cam kết" thu tuần này), cộng dồn paidAmount hiện có làm phần "đã thu" — nên hoá đơn đã trả
    // xong vẫn tính đủ vào kế hoạch (đạt 100%) thay vì biến mất khỏi kế hoạch như cách tính cũ
    // (chỉ cộng phần còn nợ). Tối đa 5 tuần chồng lên 1 tháng (cùng số cột "Tuần 1-5" như file
    // Công nợ gốc anh Quân gửi).
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const weeks: { weekIndex: number; start: Date; end: Date; planned: number; collected: number }[] = [];
    let cursor = mondayOfWeek(monthStart);
    let weekIndex = 1;
    while (cursor <= monthEnd && weekIndex <= 5) {
      weeks.push({ weekIndex, start: cursor, end: addDays(cursor, 6), planned: 0, collected: 0 });
      cursor = addDays(cursor, 7);
      weekIndex++;
    }
    for (const inv of invoices) {
      if (!inv.expectedPaymentDate) continue;
      const d = new Date(inv.expectedPaymentDate);
      const bucket = weeks.find((w) => d >= w.start && d <= w.end);
      if (!bucket) continue;
      bucket.planned += Number(inv.originalAmount);
      bucket.collected += Number(inv.paidAmount);
    }
    const monthlyPlanned = weeks.reduce((s, w) => s + w.planned, 0);
    const monthlyCollected = weeks.reduce((s, w) => s + w.collected, 0);

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
      weeklyPlan: weeks.map((w) => ({
        weekIndex: w.weekIndex,
        start: w.start,
        end: w.end,
        planned: w.planned,
        collected: w.collected,
        rate: w.planned > 0 ? w.collected / w.planned : null,
      })),
      monthlyPlan: {
        planned: monthlyPlanned,
        collected: monthlyCollected,
        rate: monthlyPlanned > 0 ? monthlyCollected / monthlyPlanned : null,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/summary GET error", err);
    return NextResponse.json({ error: "Không tải được tổng kết công nợ" }, { status: 500 });
  }
}
