import { NextRequest, NextResponse } from "next/server";
import { prisma, resolveEmployeeIdByCode } from "@hoanggia/db";
import { parseDebtNewInvoicesExcel } from "@/lib/debt-new-invoices-parser";
import { removeInvoice, rematchPayment } from "@/lib/debt-reconcile";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";
import { computeDueDateFromTerm, PaymentTerm } from "@/lib/customer-payment-term";

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
    const { rows, errors, skippedReplaced, removals, skippedNonPkd1, skippedNonPositiveAdjustment, corrections } = parseDebtNewInvoicesExcel(buffer);

    // Quy tắc thời hạn công nợ theo khách hàng (trang Khách hàng) — hoá đơn mới cuối tháng KHÔNG
    // có cột hạn thanh toán trong file AMIS, tự tính thay vì để trống chờ nhập tay.
    const allCustomers = await prisma.customer.findMany();
    const termByCode = new Map(allCustomers.filter((c) => c.paymentTermType).map((c) => [c.customerCode, c]));
    // NVKD phụ trách theo mã khách (trang Khách hàng) — dùng làm phương án dự phòng khi cột "Mã
    // nhân viên" của file hoá đơn AMIS trống/không khớp được ai (gặp thật: cả file "HĐ T9.xlsx"
    // 148 dòng không dòng nào khớp được NVKD, khiến NVKD không thấy hoá đơn của mình dù khách đã
    // có NVKD phụ trách rõ ràng ở trang Khách hàng — anh Quân báo 02/10/2026).
    const employeeByCustomerCode = new Map(allCustomers.map((c) => [c.customerCode, c.salesEmployeeId]));

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
      const salesEmployeeId = (await resolveEmployee(row.amisEmployeeCode)) ?? employeeByCustomerCode.get(row.customerCode) ?? null;
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
      const term = termByCode.get(row.customerCode);
      const dueDate = term ? computeDueDateFromTerm(row.invoiceDate, term as PaymentTerm) : null;
      if (existing) {
        // Chỉ set dueDate khi hoá đơn CHƯA có hạn thanh toán — tránh ghi đè hạn admin đã tự điền
        // hoặc đã tự tính trước đó.
        const supersedes = Array.from(new Set([...(existing.supersedes ?? []), ...row.replaces]));
        await prisma.debtInvoice.update({
          where: { id: existing.id },
          data: { ...data, supersedes, ...(existing.dueDate === null && dueDate ? { dueDate } : {}) },
        });
        updatedCount++;
      } else {
        await prisma.debtInvoice.create({ data: { ...data, dueDate, paidAmount: 0, supersedes: row.replaces } });
        createdCount++;
      }
    }

    // Ghi lại hoá đơn thay thế/điều chỉnh để Admin gán nguyên nhân (KPI Admin) — đã có thì giữ nguyên nguyên nhân đã gán.
    for (const c of corrections) {
      await prisma.invoiceCorrection.upsert({
        where: { customerCode_invoiceNumber: { customerCode: c.customerCode, invoiceNumber: c.invoiceNumber } },
        create: { ...c, customerName: c.customerName || null, statusRaw: c.statusRaw || null },
        update: { invoiceDate: c.invoiceDate, kind: c.kind, refs: c.refs, amount: c.amount, statusRaw: c.statusRaw || null },
      });
    }

    // Hoá đơn gốc/hoá đơn cũ đã bị thay thế hoặc điều chỉnh -> xoá khỏi công nợ (sau khi đã nhập hoá đơn thay thế để chuyển
    // các khoản đã thu sang). Hoá đơn đã thu đủ mà không có hoá đơn thay thế thì giữ lại, báo trong kết quả.
    let removedCount = 0;
    const keptPaid: string[] = [];
    const released = new Set<string>();
    for (const r of removals) {
      const out = await removeInvoice(prisma, r);
      if (out.result === "REMOVED" || out.result === "MOVED") removedCount++;
      if (out.result === "KEPT_PAID") keptPaid.push(`${r.invoiceNumber} (${r.customerCode})`);
      out.releasedPaymentIds.forEach((id) => released.add(id));
    }

    // Khớp lại Tiền về chưa khớp / một phần của các khách vừa có hoá đơn mới (tiền về có thể về trước khi nhập hoá đơn), và
    // các khoản vừa bị nhả khỏi hoá đơn đã xoá.
    const touchedCustomers = Array.from(new Set(rows.map((r) => r.customerCode)));
    const pending = await prisma.debtPayment.findMany({
      where: { OR: [{ id: { in: Array.from(released) } }, { matchStatus: { in: ["UNMATCHED", "PARTIAL"] }, customerCode: { in: touchedCustomers } }] },
      select: { id: true },
    });
    let rematchedCount = 0;
    for (const p of pending) {
      const res = await rematchPayment(prisma, p.id);
      if (res && res.added > 0) rematchedCount++;
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
      removedCount,
      keptPaid,
      rematchedCount,
      skippedNonPkd1,
      skippedNonPositiveAdjustment,
      correctionsRecorded: corrections.length,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/import/new-invoices error", err);
    const message = err instanceof Error ? err.message : "Import hoá đơn mới thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
