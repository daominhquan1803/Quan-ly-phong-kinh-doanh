import { NextRequest, NextResponse } from "next/server";
import { prisma, resolveEmployeeIdByName } from "@hoanggia/db";
import { parseDebtBaselineExcel } from "@/lib/debt-baseline-parser";
import { normalizeCustomerCode } from "@/lib/debt-customer-match";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { monthWeekMonday } from "@/lib/debt-status";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = parseDebtBaselineExcel(buffer);

    // Chưa có cột "Tên khách hàng" trong file Công nợ gốc — tra cứu từ đơn hàng đã có trong hệ
    // thống (cùng nguồn dữ liệu AMIS, mã khách hàng khớp nhau) để có tên hiển thị, mã nào không
    // tìm được thì tạm hiển thị đúng mã.
    const orders = await prisma.order.findMany({
      where: { customerCode: { not: null } },
      select: { customerCode: true, customerName: true },
      distinct: ["customerCode"],
    });
    const nameByCode = new Map<string, string>();
    for (const o of orders) {
      if (!o.customerCode) continue;
      nameByCode.set(normalizeCustomerCode(o.customerCode), o.customerName);
    }

    const employeeCache = new Map<string, string | null>();
    async function resolveEmployee(nameRaw: string | null): Promise<string | null> {
      if (!nameRaw) return null;
      if (!employeeCache.has(nameRaw)) employeeCache.set(nameRaw, await resolveEmployeeIdByName(nameRaw));
      return employeeCache.get(nameRaw) ?? null;
    }

    let createdCount = 0;
    let updatedCount = 0;

    // "Kế hoạch thu Tuần 1-5" trong file gốc là kế hoạch của ĐÚNG THÁNG ĐANG NHẬP FILE (anh Quân
    // xác nhận) — quy đổi sang expectedPaymentDate = Thứ 2 của tuần đó trong tháng hiện tại, để
    // lần đầu vào trang Công nợ đã có sẵn kế hoạch tháng này thay vì phải chờ NVKD tự điền lại.
    // Từ tháng sau, NVKD tự điền qua UI — vì vậy chỉ set khi hoá đơn CHƯA có expectedPaymentDate
    // (tránh ghi đè ngày NVKD đã tự sửa nếu admin lỡ nhập lại file này).
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    for (const row of rows) {
      const salesEmployeeId = await resolveEmployee(row.salesEmployeeNameRaw);
      const customerName = nameByCode.get(row.customerCode) ?? row.customerCodeRaw;
      const stillOwed = row.paidAmount < row.originalAmount;
      const weekPlanDate =
        row.weekPlanIndex && stillOwed ? monthWeekMonday(currentYear, currentMonth, row.weekPlanIndex) : null;
      const data = {
        customerCode: row.customerCode,
        customerName,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        dueDate: row.dueDate,
        originalAmount: row.originalAmount,
        salesEmployeeId,
        source: "BASELINE",
        note: row.oldWeekPlanNote,
      };

      if (row.invoiceNumber) {
        const existing = await prisma.debtInvoice.findUnique({
          where: { customerCode_invoiceNumber: { customerCode: row.customerCode, invoiceNumber: row.invoiceNumber } },
        });
        if (existing) {
          // KHÔNG ghi đè paidAmount khi update — hoá đơn đã tồn tại có thể đã được cộng dồn
          // paidAmount qua "Cập nhật Tiền về" (nguồn theo dõi thật trong app), trong khi paidAmount
          // của file Công nợ gốc chỉ là số liệu AMIS tại thời điểm export, lỡ đè lên sẽ xoá mất tiến
          // độ thanh toán đã ghi nhận (đã xác nhận qua dữ liệu thật — hoá đơn DONEX-HUNGYEN
          // 00000959 và GLOBAL MATERIAL HANDLING 00001876 bị mất paidAmount theo đúng cách này).
          await prisma.debtInvoice.update({
            where: { id: existing.id },
            data: existing.expectedPaymentDate === null && weekPlanDate ? { ...data, expectedPaymentDate: weekPlanDate } : data,
          });
          updatedCount++;
          continue;
        }
      }
      await prisma.debtInvoice.create({ data: { ...data, paidAmount: row.paidAmount, expectedPaymentDate: weekPlanDate } });
      createdCount++;
    }

    await prisma.debtImportBatch.create({
      data: {
        type: "BASELINE",
        fileName: file.name,
        totalRows: rows.length,
        createdCount,
        updatedCount,
        errorCount: errors.length,
        errorReport: errors.length ? errors : undefined,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({
      totalRows: rows.length,
      createdCount,
      updatedCount,
      errorCount: errors.length,
      errors,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/import/baseline error", err);
    const message = err instanceof Error ? err.message : "Import công nợ gốc thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
