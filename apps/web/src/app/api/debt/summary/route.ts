import { NextRequest, NextResponse } from "next/server";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { remainingAmount, computeDebtStatus, monthWeekBuckets } from "@/lib/debt-status";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const month = Number(searchParams.get("month")) || now.getMonth() + 1; // 1-12

    // "Xem công nợ tại ngày" — tính lại từ dữ liệu thật thay vì lưu snapshot: chỉ tính hoá đơn đã
    // có chứng từ tới ngày này, "đã thu" = tổng tiền về THẬT có ngày <= ngày này (không phải cột
    // paidAmount hiện tại), quá hạn/nợ xấu so với ngày này thay vì hôm nay. null = xem hiện tại
    // (hành vi cũ, dùng thẳng paidAmount cho nhanh + khớp tuyệt đối với các trang khác).
    const asOfParam = searchParams.get("asOfDate");
    const asOfDate = asOfParam ? new Date(`${asOfParam}T00:00:00+07:00`) : null;

    // Xem tại ngày = CHỐT CUỐI NGÀY đó: hoá đơn hạn đúng ngày chọn mà chưa thu tính là quá hạn 1 ngày
    // (mốc tính quá hạn lùi sang 00:00 ngày kế tiếp), còn tiền về/hoá đơn phát sinh vẫn tính tới hết
    // ngày chọn. Anh Quân xác nhận 05/10/2026 (khách NHUAYTEVN hạn 30/09 phải vào quá hạn tại 30/09).
    const overdueRefDate = asOfDate ? new Date(asOfDate.getTime() + 24 * 60 * 60 * 1000) : undefined;

    const where: Prisma.DebtInvoiceWhereInput = { ...scopeByOwner(session, "salesEmployeeId") };
    // ADMIN xem được số liệu riêng 1 nhân viên (bộ lọc "Xem theo" trên trang Công nợ) — SALES đã bị
    // scopeByOwner giới hạn chỉ của mình nên bỏ qua tham số này nếu không phải ADMIN.
    const employeeId = searchParams.get("employeeId");
    if (employeeId && session.user.role === "ADMIN") where.salesEmployeeId = employeeId;

    const invoices = await prisma.debtInvoice.findMany({
      where,
      select: {
        id: true,
        invoiceDate: true,
        originalAmount: true,
        paidAmount: true,
        dueDate: true,
        expectedPaymentDate: true,
        salesEmployeeId: true,
        salesEmployee: { select: { name: true } },
      },
    });

    // Tiền đã thu TÍNH TỚI asOfDate cho từng hoá đơn — gộp theo invoiceId từ các khoản Tiền về đã
    // khớp (payment.paymentDate <= asOfDate). Khoản chưa rõ ngày tiền về thì không tính (coi như
    // chưa xác nhận là đã về trước ngày này) — khác 1 chút so với cột paidAmount sống (luôn cộng
    // dồn bất kể có ngày hay không), chấp nhận được vì chỉ ảnh hưởng xem lại quá khứ.
    // Phần đã thu KHÔNG có khoản Tiền về nào đứng sau (nhập thẳng cột "Số tiền đã thu" từ file Công nợ
    // gốc — không có allocation/ngày) = paidAmount − tổng allocation; coi như đã thu từ TRƯỚC mọi mốc
    // ngày đang xem. Thiếu bước này thì xem tại ngày quá khứ sẽ coi mọi khoản đã thu từ file gốc là
    // chưa thu → công nợ/tỉ lệ thu hồi sai (anh Quân báo số liệu Tùng, Dung lệch 05/10/2026).
    let paidAsOfByInvoice: Map<string, number> | null = null;
    if (asOfDate) {
      const allocs = await prisma.debtPaymentAllocation.findMany({
        where: { invoiceId: { in: invoices.map((i) => i.id) } },
        select: { invoiceId: true, amount: true, payment: { select: { paymentDate: true } } },
      });
      const allAlloc = new Map<string, number>();
      const allocAsOf = new Map<string, number>();
      for (const a of allocs) {
        const amt = Number(a.amount);
        allAlloc.set(a.invoiceId, (allAlloc.get(a.invoiceId) ?? 0) + amt);
        const d = a.payment.paymentDate;
        if (d && d <= asOfDate) allocAsOf.set(a.invoiceId, (allocAsOf.get(a.invoiceId) ?? 0) + amt);
      }
      paidAsOfByInvoice = new Map();
      for (const inv of invoices) {
        const untracked = Math.max(0, Number(inv.paidAmount) - (allAlloc.get(inv.id) ?? 0));
        paidAsOfByInvoice.set(inv.id, untracked + (allocAsOf.get(inv.id) ?? 0));
      }
    }

    let totalOriginal = 0;
    let totalPaid = 0;
    let totalDebt = 0;
    let overdueDebt = 0;
    let badDebt = 0;
    let noDueDebt = 0; // còn nợ nhưng chưa có hạn thanh toán — KHÔNG thể xếp quá hạn, nằm trong mẫu số tỉ lệ

    const perEmployee = new Map<string, { employeeId: string; employeeName: string; totalDebt: number; overdueDebt: number; badDebt: number }>();

    for (const inv of invoices) {
      // Hoá đơn chưa phát sinh tại thời điểm asOfDate (chứng từ sau ngày đang xem) — bỏ qua khỏi
      // tổng kết "tại ngày đó". Hoá đơn không rõ ngày chứng từ thì vẫn tính (không đủ căn cứ loại).
      if (asOfDate && inv.invoiceDate && inv.invoiceDate > asOfDate) continue;

      const original = Number(inv.originalAmount);
      const paid = asOfDate ? paidAsOfByInvoice!.get(inv.id) ?? 0 : Number(inv.paidAmount);
      const remaining = remainingAmount(original, paid);
      totalOriginal += original;
      totalPaid += paid;
      totalDebt += remaining;
      const status = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid }, overdueRefDate);
      if (status === "OVERDUE" || status === "BAD_DEBT") overdueDebt += remaining;
      if (status === "BAD_DEBT") badDebt += remaining;
      if (status === "NO_DUE_DATE") noDueDebt += remaining;

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
    for (const inv of invoices) {
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
        totalReceived: monthlyTotalReceived,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/summary GET error", err);
    return NextResponse.json({ error: "Không tải được tổng kết công nợ" }, { status: 500 });
  }
}
