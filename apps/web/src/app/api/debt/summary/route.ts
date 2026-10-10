import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { monthWeekBuckets } from "@/lib/debt-status";
import { getDebtSnapshot } from "@/lib/debt-snapshot";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const month = Number(searchParams.get("month")) || now.getMonth() + 1; // 1-12

    // "Xem công nợ tại ngày" — tính lại từ dữ liệu thật thay vì lưu snapshot (cách tính nằm ở
    // lib/debt-snapshot.ts, dùng chung với báo cáo tuần/tháng). null = xem hiện tại.
    const asOfParam = searchParams.get("asOfDate");
    const asOfDate = asOfParam ? new Date(`${asOfParam}T00:00:00+07:00`) : null;

    const where: Prisma.DebtInvoiceWhereInput = { ...scopeByOwner(session, "salesEmployeeId") };
    // ADMIN xem được số liệu riêng 1 nhân viên (bộ lọc "Xem theo" trên trang Công nợ) — SALES đã bị
    // scopeByOwner giới hạn chỉ của mình nên bỏ qua tham số này nếu không phải ADMIN.
    const employeeId = searchParams.get("employeeId");
    if (employeeId && session.user.role === "ADMIN") where.salesEmployeeId = employeeId;

    const snap = await getDebtSnapshot({ where, asOfDate });
    const { totalOriginal, totalPaid, totalDebt, overdueDebt, badDebt, noDueDebt } = snap;
    const perEmployee =
      session.user.role === "ADMIN"
        ? Array.from(snap.perEmployee.values()).map((e) => ({
            employeeId: e.employeeId,
            employeeName: e.employeeName,
            totalDebt: e.totalDebt,
            overdueDebt: e.overdueDebt,
            badDebt: e.badDebt,
          }))
        : null;

    // Kế hoạch thu theo tuần dương lịch (Thứ 2 - Chủ nhật) trong tháng được chọn — "Kế hoạch" =
    // TOÀN BỘ originalAmount của các hoá đơn có NVKD điền expectedPaymentDate rơi vào đúng tuần
    // đó (mục tiêu cam kết thu tuần này). "Đã thu" PHẢI lấy đúng NGÀY TIỀN VỀ THẬT (payment.
    // paymentDate của giao dịch Tiền về đã khớp vào hoá đơn đó) — TUYỆT ĐỐI không được lấy theo
    // tuần dự kiến của hoá đơn, nếu không tuần tương lai (chưa tới) vẫn hiện "đã thu" > 0 (lỗi
    // thật anh Quân phát hiện: khách trả trước hạn dự kiến ở 1 tuần sau, tiền lại bị tính vào
    // đúng tuần dự kiến đó dù tuần đó chưa xảy ra). Tối đa 5 tuần chồng lên 1 tháng (cùng số cột
    // "Tuần 1-5" như file Công nợ gốc anh Quân gửi).
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const weeks = monthWeekBuckets(year, month).map((b) => ({ ...b, planned: 0, collected: 0 }));
    const planInvoices = await prisma.debtInvoice.findMany({
      where,
      select: { originalAmount: true, expectedPaymentDate: true },
    });
    for (const inv of planInvoices) {
      if (!inv.expectedPaymentDate) continue;
      const d = new Date(inv.expectedPaymentDate);
      const bucket = weeks.find((w) => d >= w.start && d <= w.end);
      if (bucket) bucket.planned += Number(inv.originalAmount);
    }
    // Chỉ tính các khoản Tiền về đã khớp được vào đúng hoá đơn nằm trong phạm vi đang xem (cùng
    // `where` với danh sách hoá đơn ở trên) — khoản "Chưa khớp" (không rõ hoá đơn/nhân viên nào)
    // không tính vào đây vì không biết thuộc kế hoạch của ai.
    const allocations = await prisma.debtPaymentAllocation.findMany({
      where: { invoice: where },
      select: { amount: true, payment: { select: { paymentDate: true } } },
    });
    for (const alloc of allocations) {
      const d = alloc.payment.paymentDate;
      if (!d) continue;
      const bucket = weeks.find((w) => d >= w.start && d <= w.end);
      if (bucket) bucket.collected += Number(alloc.amount);
    }
    const monthlyPlanned = weeks.reduce((s, w) => s + w.planned, 0);
    const monthlyCollected = weeks.reduce((s, w) => s + w.collected, 0);

    // Tổng TẤT CẢ tiền về trong tháng (không lọc theo NVKD/kế hoạch) — khác với monthlyCollected
    // ở trên (chỉ tính khoản đã khớp vào đúng hoá đơn trong phạm vi đang xem). Khoản "Chưa khớp"
    // không gắn được với 1 NVKD cụ thể nên con số này luôn tính TOÀN CÔNG TY, không theo bộ lọc
    // nhân viên — là tổng tiền thực tế vào tài khoản tháng này, không phải tiền đã khớp kế hoạch.
    // Bỏ khoản đã đánh dấu IGNORED (admin xác nhận không phải tiền thật/đã ghi nhận chỗ khác).
    const totalReceivedAgg = await prisma.debtPayment.aggregate({
      where: { paymentDate: { gte: monthStart, lte: monthEnd }, matchStatus: { not: "IGNORED" } },
      _sum: { amount: true },
    });
    const monthlyTotalReceived = Number(totalReceivedAgg._sum.amount ?? 0);

    return NextResponse.json({
      totalOriginal,
      totalPaid,
      totalDebt,
      overdueDebt,
      badDebt,
      noDueDebt,
      overdueRate: totalDebt > 0 ? overdueDebt / totalDebt : 0,
      badDebtRate: totalDebt > 0 ? badDebt / totalDebt : 0,
      perEmployee,
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
        totalReceived: monthlyTotalReceived,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/summary GET error", err);
    return NextResponse.json({ error: "Không tải được tổng kết công nợ" }, { status: 500 });
  }
}
