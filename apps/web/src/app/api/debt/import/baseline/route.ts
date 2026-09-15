import { NextRequest, NextResponse } from "next/server";
import { prisma, resolveEmployeeIdByName } from "@hoanggia/db";
import { parseDebtBaselineExcel } from "@/lib/debt-baseline-parser";
import { normalizeCustomerCode } from "@/lib/debt-customer-match";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

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

    for (const row of rows) {
      const salesEmployeeId = await resolveEmployee(row.salesEmployeeNameRaw);
      const customerName = nameByCode.get(row.customerCode) ?? row.customerCodeRaw;
      const data = {
        customerCode: row.customerCode,
        customerName,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        dueDate: row.dueDate,
        originalAmount: row.originalAmount,
        paidAmount: row.paidAmount,
        salesEmployeeId,
        source: "BASELINE",
        note: row.oldWeekPlanNote,
      };

      if (row.invoiceNumber) {
        const existing = await prisma.debtInvoice.findUnique({
          where: { customerCode_invoiceNumber: { customerCode: row.customerCode, invoiceNumber: row.invoiceNumber } },
        });
        if (existing) {
          await prisma.debtInvoice.update({ where: { id: existing.id }, data });
          updatedCount++;
          continue;
        }
      }
      await prisma.debtInvoice.create({ data });
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
