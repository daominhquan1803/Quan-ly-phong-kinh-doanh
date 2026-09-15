import { NextResponse } from "next/server";
import { prisma, getPoAggregates } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { getEmployeeTargetVsActual, getProductGroupTargetVsActual } from "@/lib/dashboard-metrics";
import { daysUntilDeadline } from "@/lib/order-status";
import { remainingAmount, overdueDays } from "@/lib/debt-status";

const TOP_OVERDUE_COUNT = 10;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await requireSession();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    const perEmployee = await getEmployeeTargetVsActual(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    const totalTarget = perEmployee.reduce((s, r) => s + r.targetRevenue, 0);
    const totalActual = perEmployee.reduce((s, r) => s + r.actualRevenue, 0);
    const totalPoValue = perEmployee.reduce((s, r) => s + r.poValue, 0);
    const completionPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : null;

    const byProductGroup = await getProductGroupTargetVsActual(
      year,
      month,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );

    // So sánh với tháng trước để hiện xu hướng tăng/giảm ở các thẻ KPI — chỉ tính khi có
    // dữ liệu thật của tháng trước, không suy đoán.
    let prevYear = year;
    let prevMonth = month - 1;
    if (prevMonth < 1) {
      prevMonth = 12;
      prevYear -= 1;
    }
    const prevPerEmployee = await getEmployeeTargetVsActual(
      prevYear,
      prevMonth,
      session.user.role === "ADMIN" ? undefined : session.user.id
    );
    const prevTotalTarget = prevPerEmployee.reduce((s, r) => s + r.targetRevenue, 0);
    const prevTotalActual = prevPerEmployee.reduce((s, r) => s + r.actualRevenue, 0);
    const prevTotalPoValue = prevPerEmployee.reduce((s, r) => s + r.poValue, 0);
    const prevCompletionPct = prevTotalTarget > 0 ? Math.round((prevTotalActual / prevTotalTarget) * 100) : null;

    const actualTrendPct = prevTotalActual > 0 ? Math.round(((totalActual - prevTotalActual) / prevTotalActual) * 100) : null;
    const poTrendPct = prevTotalPoValue > 0 ? Math.round(((totalPoValue - prevTotalPoValue) / prevTotalPoValue) * 100) : null;
    const completionTrendPts = completionPct != null && prevCompletionPct != null ? completionPct - prevCompletionPct : null;

    // Đơn hàng quá hạn — lấy CHUNG nguồn PoTrackingLine với trang Tiến độ giao hàng (xem
    // getPoAggregates) thay vì bảng Order đồng bộ AMIS trực tiếp như trước — trước đây 2 nơi
    // dùng 2 nguồn khác nhau nên có thể lệch số, và Order không có sẵn "giá trị còn lại" để
    // sắp xếp top 10 theo giá trị cao nhất như anh yêu cầu.
    const allPos = await getPoAggregates(scopeByOwner(session, "salesEmployeeId"));
    const isPoOverdue = (p: (typeof allPos)[number]) => {
      if (!p.isOpen || !p.earliestOpenDeadline) return false;
      const days = daysUntilDeadline(p.earliestOpenDeadline);
      return days != null && days < 0;
    };
    const allOverduePos = allPos.filter(isPoOverdue);
    // Chỉ hiện top 10 đơn có giá trị chưa giao cao nhất — đúng theo yêu cầu, thay vì sắp theo
    // hạn giao gần nhất như trước.
    const overduePos = [...allOverduePos].sort((a, b) => b.remainingValue - a.remainingValue).slice(0, TOP_OVERDUE_COUNT);

    // Công nợ là số liệu tổng của cả phòng (không gắn được theo từng nhân viên) — chỉ
    // ADMIN mới thấy, đúng yêu cầu "chỉ Quản trị viên xem được thông tin tổng của cả phòng".
    // Trang Công nợ đã bỏ đồng bộ tự động hienvi.me, chuyển sang quản lý trực tiếp trong hệ
    // thống (xem apps/web/src/lib/debt-status.ts) — số liệu ở đây tính trực tiếp từ DebtInvoice
    // hiện có thay vì đọc snapshot đồng bộ theo ngày như trước, nên KHÔNG còn xu hướng
    // tăng/giảm so với "lần đồng bộ trước" (không có lịch sử snapshot định kỳ để so sánh nữa).
    const isAdmin = session.user.role === "ADMIN";
    let debtTotal: number | null = null;
    let debtOverdue: number | null = null;
    let debtUpdatedAt: Date | null = null;
    if (isAdmin) {
      const invoices = await prisma.debtInvoice.findMany({
        select: { originalAmount: true, paidAmount: true, dueDate: true },
      });
      debtTotal = 0;
      debtOverdue = 0;
      for (const inv of invoices) {
        const remaining = remainingAmount(Number(inv.originalAmount), Number(inv.paidAmount));
        debtTotal += remaining;
        const days = overdueDays(inv.dueDate);
        if (days !== null && days > 0) debtOverdue += remaining;
      }
      const lastBatch = await prisma.debtImportBatch.findFirst({ orderBy: { createdAt: "desc" } });
      debtUpdatedAt = lastBatch?.createdAt ?? null;
    }

    return NextResponse.json({
      year,
      month,
      totalTarget,
      totalActual,
      totalPoValue,
      completionPct,
      actualTrendPct,
      poTrendPct,
      completionTrendPts,
      perEmployee,
      byProductGroup,
      overdueOrderCount: allOverduePos.length,
      overdueOrders: overduePos.map((p) => ({
        poCode: p.poCode,
        customerName: p.customerCode ?? "—",
        salesEmployeeName: p.salesEmployeeName,
        expectedDeliveryDate: p.earliestOpenDeadline,
        remainingValue: p.remainingValue,
      })),
      debtTotal,
      debtOverdue,
      debtUpdatedAt,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("dashboard/summary GET error", err);
    return NextResponse.json({ error: "Không tải được dữ liệu tổng quan" }, { status: 500 });
  }
}
