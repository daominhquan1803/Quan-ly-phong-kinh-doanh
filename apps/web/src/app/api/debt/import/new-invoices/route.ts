import { NextRequest, NextResponse } from "next/server";
import { prisma, resolveEmployeeIdByCode } from "@hoanggia/db";
import { parseDebtNewInvoicesExcel } from "@/lib/debt-new-invoices-parser";
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
    const { rows, errors, skippedReplaced } = parseDebtNewInvoicesExcel(buffer);

    const employeeCache = new Map<string, string | null>();
    async function resolveEmployee(code: string | null): Promise<string | null> {
      if (!code) return null;
      if (employeeCache.has(code)) return employeeCache.get(code) ?? null;
      let id = await resolveEmployeeIdByCode(code);
      if (!id) {
        // Dữ liệu thật thấy mã có hậu tố số lạ (vd "THANHTUNG1" trong khi mã đúng đang quản lý
        // là "THANHTUNG") — thử bỏ số cuối rồi khớp lại trước khi chịu bỏ trống.
        const stripped = code.replace(/\d+$/, "");
        if (stripped !== code) id = await resolveEmployeeIdByCode(stripped);
      }
      employeeCache.set(code, id);
      return id;
    }

    let createdCount = 0;
    let updatedCount = 0;

    for (const row of rows) {
      const salesEmployeeId = await resolveEmployee(row.amisEmployeeCode);
      const data = {
        customerCode: row.customerCode,
        customerName: row.customerName || row.customerCodeRaw,
        invoiceNumber: row.invoiceNumber,
        invoiceDate: row.invoiceDate,
        originalAmount: row.originalAmount,
        salesEmployeeId,
        source: "NEW_INVOICE",
      };

      const existing = await prisma.debtInvoice.findUnique({
        where: { customerCode_invoiceNumber: { customerCode: row.customerCode, invoiceNumber: row.invoiceNumber } },
      });
      if (existing) {
        await prisma.debtInvoice.update({ where: { id: existing.id }, data });
        updatedCount++;
      } else {
        await prisma.debtInvoice.create({ data: { ...data, paidAmount: 0 } });
        createdCount++;
      }
    }

    await prisma.debtImportBatch.create({
      data: {
        type: "NEW_INVOICES",
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
      skippedReplaced,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/import/new-invoices error", err);
    const message = err instanceof Error ? err.message : "Import hoá đơn mới thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
