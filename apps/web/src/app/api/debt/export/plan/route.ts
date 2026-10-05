import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma, Prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { remainingAmount, computeDebtStatus, overdueDays, monthWeekBuckets, type DebtStatus } from "@/lib/debt-status";
import { embedLogo, addCompanyHeaderLines, NAVY, HEADER_FILL, THIN_BOX } from "@/lib/excel-brand";

export const dynamic = "force-dynamic";

// Nhãn cột "Thông báo" ĐÚNG CHỮ như file gốc "KẾ HOẠCH THU HỒI CÔNG NỢ-PKD1.xlsx" anh Quân gửi
// (sheet "KẾ HOẠCH THU", cột K) — khác chữ với DEBT_STATUS_LABEL dùng cho badge trên web.
const ORIGINAL_STATUS_LABEL: Record<DebtStatus, string> = {
  BAD_DEBT: "Nợ xấu",
  OVERDUE: "Quá hạn",
  DUE_SOON: "Chuẩn bị đến hạn",
  CURRENT: "Đến hạn",
  NO_DUE_DATE: "---",
  PAID: "OK",
};

const CURRENCY_FMT = '_-* #,##0_-;-* #,##0_-;_-* "-"??_-;_-@_-';
const DATE_FMT = "d/m/yyyy";
const BODY_FONT = { name: "Times New Roman", size: 12 };

interface Bucket {
  weekIndex: number;
  start: Date;
  end: Date;
}

function weekIndexOf(buckets: Bucket[], d: Date | null): number | null {
  if (!d) return null;
  const b = buckets.find((w) => d >= w.start && d <= w.end);
  return b ? b.weekIndex : null;
}

/** Xuất Excel "Kế hoạch thu hồi công nợ tháng X" — 2 sheet: "Tổng kết" (dashboard tổng hợp) và
 * "KẾ HOẠCH THU" (chi tiết từng hoá đơn, đúng cột/định dạng file gốc anh Quân dùng — xem
 * scripts/inspect-debt-plan-*.ts, chạy 1 lần để dò cấu trúc file mẫu rồi xoá không còn cần nữa). */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const year = Number(searchParams.get("year")) || now.getFullYear();
    const month = Number(searchParams.get("month")) || now.getMonth() + 1;

    const where: Prisma.DebtInvoiceWhereInput = { ...scopeByOwner(session, "salesEmployeeId") };
    const employeeId = searchParams.get("employeeId");
    if (employeeId && session.user.role === "ADMIN") where.salesEmployeeId = employeeId;

    const invoices = await prisma.debtInvoice.findMany({
      where,
      select: {
        id: true,
        customerCode: true,
        customerName: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        originalAmount: true,
        paidAmount: true,
        expectedPaymentDate: true,
        salesEmployee: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }],
    });

    const allocations = await prisma.debtPaymentAllocation.findMany({
      where: { invoice: where },
      select: { invoiceId: true, amount: true, payment: { select: { paymentDate: true } } },
    });
    const allocByInvoice = new Map<string, { amount: number; paymentDate: Date | null }[]>();
    for (const a of allocations) {
      const arr = allocByInvoice.get(a.invoiceId) ?? [];
      arr.push({ amount: Number(a.amount), paymentDate: a.payment.paymentDate });
      allocByInvoice.set(a.invoiceId, arr);
    }

    const buckets: Bucket[] = monthWeekBuckets(year, month);

    const rows = invoices.map((inv) => {
      const original = Number(inv.originalAmount);
      const paid = Number(inv.paidAmount);
      const remaining = remainingAmount(original, paid);
      const status = computeDebtStatus({ dueDate: inv.dueDate, originalAmount: original, paidAmount: paid });
      const days = overdueDays(inv.dueDate);
      const weekPlanned: number[] = [0, 0, 0, 0, 0];
      const plannedWeek = weekIndexOf(buckets, inv.expectedPaymentDate);
      if (plannedWeek) weekPlanned[plannedWeek - 1] = original;
      const weekCollected: number[] = [0, 0, 0, 0, 0];
      for (const a of allocByInvoice.get(inv.id) ?? []) {
        const w = weekIndexOf(buckets, a.paymentDate);
        if (w) weekCollected[w - 1] += a.amount;
      }
      const loanDays =
        inv.dueDate && inv.invoiceDate ? Math.round((inv.dueDate.getTime() - inv.invoiceDate.getTime()) / 86400000) : null;
      return { inv, original, paid, remaining, status, days, weekPlanned, weekCollected, loanDays };
    });

    // ---- Tổng kết (như 5 thẻ + bảng trạng thái + bảng theo tuần trên trang Công nợ) ----
    let totalDebt = 0;
    let overdueDebt = 0;
    let badDebt = 0;
    let totalOriginal = 0;
    const byStatus = new Map<DebtStatus, { count: number; amount: number }>();
    const byEmployee = new Map<string, { totalDebt: number; overdueDebt: number; badDebt: number }>();
    const weeklyPlanned = [0, 0, 0, 0, 0];
    const weeklyCollected = [0, 0, 0, 0, 0];
    for (const r of rows) {
      totalOriginal += r.original;
      totalDebt += r.remaining;
      if (r.status === "OVERDUE" || r.status === "BAD_DEBT") overdueDebt += r.remaining;
      if (r.status === "BAD_DEBT") badDebt += r.remaining;
      const bs = byStatus.get(r.status) ?? { count: 0, amount: 0 };
      bs.count++;
      bs.amount += r.remaining;
      byStatus.set(r.status, bs);
      const empName = r.inv.salesEmployee?.name ?? "(Chưa gán)";
      const be = byEmployee.get(empName) ?? { totalDebt: 0, overdueDebt: 0, badDebt: 0 };
      be.totalDebt += r.remaining;
      if (r.status === "OVERDUE" || r.status === "BAD_DEBT") be.overdueDebt += r.remaining;
      if (r.status === "BAD_DEBT") be.badDebt += r.remaining;
      byEmployee.set(empName, be);
      for (let i = 0; i < 5; i++) {
        weeklyPlanned[i] += r.weekPlanned[i];
        weeklyCollected[i] += r.weekCollected[i];
      }
    }
    const overdueRate = totalDebt > 0 ? overdueDebt / totalDebt : 0;
    const badDebtRate = totalDebt > 0 ? badDebt / totalDebt : 0;

    // ---------------------------------------------------------------------------------------
    const workbook = new ExcelJS.Workbook();

    // ===== Sheet 1: Tổng kết =====
    const summarySheet = workbook.addWorksheet("Tổng kết", { views: [{ showGridLines: false }] });
    summarySheet.columns = [{ width: 4 }, { width: 28 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }];
    await embedLogo(workbook, summarySheet);
    let r = addCompanyHeaderLines(summarySheet, 4, 2, 4);
    r++;
    summarySheet.mergeCells(r, 1, r, 6);
    summarySheet.getCell(r, 1).value = `KẾ HOẠCH THU HỒI CÔNG NỢ THÁNG ${month}/${year}`;
    summarySheet.getCell(r, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
    summarySheet.getCell(r, 1).alignment = { horizontal: "center" };
    r += 1;
    summarySheet.mergeCells(r, 1, r, 6);
    summarySheet.getCell(r, 1).value = `Phạm vi: ${employeeId ? rows[0]?.inv.salesEmployee?.name ?? "1 nhân viên" : "Cả phòng kinh doanh"} — Xuất ngày ${now.toLocaleDateString("vi-VN")}`;
    summarySheet.getCell(r, 1).alignment = { horizontal: "center" };
    summarySheet.getCell(r, 1).font = { italic: true, color: { argb: "FF6B7280" } };
    r += 2;

    function kpiCell(row: number, col: number, label: string, value: string, color?: string) {
      const cell = summarySheet.getCell(row, col);
      summarySheet.getCell(row - 1, col).value = label;
      summarySheet.getCell(row - 1, col).font = { bold: true, size: 9, color: { argb: "FF6B7280" } };
      cell.value = value;
      cell.font = { bold: true, size: 13, color: { argb: color ?? NAVY } };
    }
    const kpiRow = r + 1;
    kpiCell(kpiRow, 2, "TỔNG CÔNG NỢ", totalDebt.toLocaleString("vi-VN") + " đ");
    kpiCell(kpiRow, 3, "QUÁ HẠN", overdueDebt.toLocaleString("vi-VN") + " đ", "FFC8102E");
    kpiCell(kpiRow, 4, "TỈ LỆ QUÁ HẠN", (overdueRate * 100).toFixed(1) + "%", "FFC8102E");
    kpiCell(kpiRow, 5, "NỢ XẤU (>180 NGÀY)", badDebt.toLocaleString("vi-VN") + " đ", "FFC8102E");
    r = kpiRow + 2;

    summarySheet.getCell(r, 2).value = "Công nợ theo trạng thái";
    summarySheet.getCell(r, 2).font = { bold: true, size: 12 };
    r++;
    const statusHeaderRow = r;
    ["Trạng thái", "Số hoá đơn", "Số tiền"].forEach((h, i) => {
      const c = summarySheet.getCell(statusHeaderRow, 2 + i);
      c.value = h;
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      c.border = THIN_BOX;
    });
    r++;
    const statusOrder: DebtStatus[] = ["BAD_DEBT", "OVERDUE", "DUE_SOON", "CURRENT", "NO_DUE_DATE", "PAID"];
    for (const st of statusOrder) {
      const s = byStatus.get(st);
      if (!s) continue;
      summarySheet.getCell(r, 2).value = ORIGINAL_STATUS_LABEL[st];
      summarySheet.getCell(r, 3).value = s.count;
      summarySheet.getCell(r, 4).value = s.amount;
      summarySheet.getCell(r, 4).numFmt = CURRENCY_FMT;
      for (let c = 2; c <= 4; c++) summarySheet.getCell(r, c).border = THIN_BOX;
      r++;
    }
    r++;

    summarySheet.getCell(r, 2).value = `Kế hoạch thu theo tuần — tháng ${month}/${year}`;
    summarySheet.getCell(r, 2).font = { bold: true, size: 12 };
    r++;
    const weekHeaderRow = r;
    ["Tuần", "Kế hoạch", "Đã thu", "% đạt"].forEach((h, i) => {
      const c = summarySheet.getCell(weekHeaderRow, 2 + i);
      c.value = h;
      c.font = { bold: true };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      c.border = THIN_BOX;
    });
    r++;
    for (let i = 0; i < buckets.length; i++) {
      summarySheet.getCell(r, 2).value = `Tuần ${i + 1} (${buckets[i].start.toLocaleDateString("vi-VN")}–${buckets[i].end.toLocaleDateString("vi-VN")})`;
      summarySheet.getCell(r, 3).value = weeklyPlanned[i];
      summarySheet.getCell(r, 3).numFmt = CURRENCY_FMT;
      summarySheet.getCell(r, 4).value = weeklyCollected[i];
      summarySheet.getCell(r, 4).numFmt = CURRENCY_FMT;
      summarySheet.getCell(r, 5).value = weeklyPlanned[i] > 0 ? weeklyCollected[i] / weeklyPlanned[i] : null;
      summarySheet.getCell(r, 5).numFmt = "0.0%";
      for (let c = 2; c <= 5; c++) summarySheet.getCell(r, c).border = THIN_BOX;
      r++;
    }
    r++;

    if (session.user.role === "ADMIN" && byEmployee.size > 1) {
      summarySheet.getCell(r, 2).value = "Công nợ theo từng Nhân viên kinh doanh";
      summarySheet.getCell(r, 2).font = { bold: true, size: 12 };
      r++;
      const empHeaderRow = r;
      ["Nhân viên", "Tổng công nợ", "Quá hạn", "Nợ xấu"].forEach((h, i) => {
        const c = summarySheet.getCell(empHeaderRow, 2 + i);
        c.value = h;
        c.font = { bold: true };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
        c.border = THIN_BOX;
      });
      r++;
      for (const [name, e] of Array.from(byEmployee.entries()).sort((a, b) => b[1].totalDebt - a[1].totalDebt)) {
        summarySheet.getCell(r, 2).value = name;
        summarySheet.getCell(r, 3).value = e.totalDebt;
        summarySheet.getCell(r, 3).numFmt = CURRENCY_FMT;
        summarySheet.getCell(r, 4).value = e.overdueDebt;
        summarySheet.getCell(r, 4).numFmt = CURRENCY_FMT;
        summarySheet.getCell(r, 5).value = e.badDebt;
        summarySheet.getCell(r, 5).numFmt = CURRENCY_FMT;
        for (let c = 2; c <= 5; c++) summarySheet.getCell(r, c).border = THIN_BOX;
        r++;
      }
    }

    // ===== Sheet 2: KẾ HOẠCH THU (đúng cột file gốc) =====
    const detailSheet = workbook.addWorksheet("KẾ HOẠCH THU", { views: [{ showGridLines: false, state: "frozen", xSplit: 5, ySplit: 3 }] });
    detailSheet.columns = [
      { width: 17.75 }, { width: 10.1 }, { width: 12 }, { width: 18.25 }, { width: 17.1 }, // A-E
      { width: 14 }, { width: 12.6 }, { width: 16.5 }, { width: 6.75 }, { width: 14.25 }, // F-J
      { width: 10.25 }, { width: 16 }, // K-L
      { width: 18.25 }, { width: 18.25 }, { width: 18.9 }, { width: 18.9 }, // M-P
      { width: 18.4 }, { width: 18.4 }, { width: 17.6 }, { width: 17.6 }, // Q-T
      { width: 16.9 }, { width: 16.9 }, // U-V
    ];
    detailSheet.getCell("J1").value = "Ngày tính";
    detailSheet.getCell("J1").font = { bold: true };
    detailSheet.getCell("J2").value = now;
    detailSheet.getCell("J2").numFmt = DATE_FMT;
    detailSheet.getCell("A2").value = "TỔNG";
    detailSheet.getCell("A2").font = { bold: true };

    const headers = [
      "Mã khách hàng", "Ngày chứng từ", "Số hóa đơn", "Hạn thanh toán", "Tổng dư nợ",
      "Tên NVKD", "Số tiền đã thu", "Tổng tiền còn phải thu", "Số ngày được nợ", "Ngày quá hạn",
      "Thông báo", "Tiền quá hạn",
      "Kế hoạch Tuần 1", "Tiền về Tuần 1", "Kế hoạch Tuần 2", "Tiền về Tuần 2",
      "Kế hoạch Tuần 3", "Tiền về Tuần 3", "Kế hoạch Tuần 4", "Tiền về Tuần 4",
      "Kế hoạch Tuần 5", "Tiền về Tuần 5",
    ];
    headers.forEach((h, i) => {
      const cell = detailSheet.getCell(3, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      if (i === 7) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } }; // H: Tổng tiền còn phải thu
    });

    let totalRemaining = 0;
    let totalPaidCol = 0;
    let totalOverdueAmt = 0;
    const totalWeekPlanned = [0, 0, 0, 0, 0];
    const totalWeekCollected = [0, 0, 0, 0, 0];

    rows.forEach((row, idx) => {
      const r2 = 4 + idx;
      const vals: (string | number | Date | null)[] = [
        row.inv.customerCode,
        row.inv.invoiceDate,
        row.inv.invoiceNumber,
        row.inv.dueDate,
        row.original,
        row.inv.salesEmployee?.name ?? "",
        row.paid,
        row.remaining,
        row.loanDays,
        row.status === "PAID" ? "Đã TT" : row.days,
        ORIGINAL_STATUS_LABEL[row.status],
        row.status === "OVERDUE" || row.status === "BAD_DEBT" ? row.remaining : 0,
        row.weekPlanned[0] || null, row.weekCollected[0] || null,
        row.weekPlanned[1] || null, row.weekCollected[1] || null,
        row.weekPlanned[2] || null, row.weekCollected[2] || null,
        row.weekPlanned[3] || null, row.weekCollected[3] || null,
        row.weekPlanned[4] || null, row.weekCollected[4] || null,
      ];
      vals.forEach((v, c) => {
        const cell = detailSheet.getCell(r2, c + 1);
        cell.value = v;
        cell.font = BODY_FONT;
        if (c === 1 || c === 3) cell.numFmt = DATE_FMT; // B Ngày chứng từ, D Hạn thanh toán
        else if (c === 9) cell.numFmt = "0"; // J Ngày quá hạn (số nguyên, hoặc text "Đã TT")
        else if (c >= 4 && c !== 5 && c !== 8 && c !== 10) cell.numFmt = CURRENCY_FMT; // E,G,H,L,M..V (tiền) — trừ F (tên NVKD), I (số ngày), K (text)
      });
      totalRemaining += row.remaining;
      totalPaidCol += row.paid;
      totalOverdueAmt += row.status === "OVERDUE" || row.status === "BAD_DEBT" ? row.remaining : 0;
      for (let i = 0; i < 5; i++) {
        totalWeekPlanned[i] += row.weekPlanned[i];
        totalWeekCollected[i] += row.weekCollected[i];
      }
    });

    // Dòng 2 — tổng theo cột (thay cho công thức SUBTOTAL sống của file gốc, vì đây là bản xuất
    // tĩnh 1 lần, không phải workbook sống người dùng tự lọc/sửa tiếp).
    detailSheet.getCell(2, 5).value = totalOriginal;
    detailSheet.getCell(2, 7).value = totalPaidCol;
    detailSheet.getCell(2, 8).value = totalRemaining;
    detailSheet.getCell(2, 8).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    detailSheet.getCell(2, 8).font = { bold: true };
    detailSheet.getCell(2, 12).value = totalOverdueAmt;
    const weekColOffsets = [13, 15, 17, 19, 21];
    for (let i = 0; i < 5; i++) {
      detailSheet.getCell(2, weekColOffsets[i]).value = totalWeekPlanned[i];
      detailSheet.getCell(2, weekColOffsets[i] + 1).value = totalWeekCollected[i];
    }
    for (const c of [5, 7, 8, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]) {
      detailSheet.getCell(2, c).numFmt = CURRENCY_FMT;
      detailSheet.getCell(2, c).font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Ke hoach thu hoi cong no thang ${month}-${year}.xlsx`;
    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("debt/export/plan GET error", err);
    return NextResponse.json({ error: "Không xuất được file kế hoạch thu" }, { status: 500 });
  }
}
