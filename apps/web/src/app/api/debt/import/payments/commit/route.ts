import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { parseDebtPaymentsExcel } from "@/lib/debt-payments-parser";
import { remainingAmount } from "@/lib/debt-status";
import { planPaymentAllocation } from "@/lib/debt-payment-allocation";
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
    const { rows, errors } = parseDebtPaymentsExcel(buffer);

    const codes = Array.from(new Set(rows.map((r) => r.customerCode).filter((c): c is string => !!c)));
    // remaining giữ TRONG BỘ NHỚ, cập nhật dần khi xử lý từng dòng trong CÙNG file — để 2 giao
    // dịch "Tiền về" của cùng 1 khách trong cùng file không vô tình cùng trừ vào đúng 1 hoá đơn.
    const invoicesByCode = new Map<
      string,
      { id: string; invoiceNumber: string | null; invoiceDate: Date | null; remaining: number }[]
    >();
    if (codes.length > 0) {
      const invoices = await prisma.debtInvoice.findMany({
        where: { customerCode: { in: codes } },
        select: { id: true, customerCode: true, invoiceNumber: true, invoiceDate: true, originalAmount: true, paidAmount: true },
      });
      for (const inv of invoices) {
        const list = invoicesByCode.get(inv.customerCode) ?? [];
        list.push({
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: inv.invoiceDate,
          remaining: remainingAmount(Number(inv.originalAmount), Number(inv.paidAmount)),
        });
        invoicesByCode.set(inv.customerCode, list);
      }
    }

    const batch = await prisma.debtImportBatch.create({
      data: {
        type: "PAYMENTS",
        fileName: file.name,
        totalRows: rows.length,
        createdCount: 0,
        updatedCount: 0,
        errorCount: errors.length,
        errorReport: errors.length ? errors : undefined,
        createdById: session.user.id,
      },
    });

    // Chặn ghi trùng khi up lại đúng file (hoặc file có dòng lặp) — so theo sourceHash (nội dung
    // dòng: ngày + mã KH + số tiền + mô tả), xem debt-payments-parser.ts và DebtPayment.sourceHash.
    const existingHashes = new Set(
      (
        await prisma.debtPayment.findMany({
          where: { sourceHash: { in: rows.map((r) => r.sourceHash) } },
          select: { sourceHash: true },
        })
      ).map((p) => p.sourceHash)
    );

    let matchedCount = 0;
    let partialCount = 0;
    let unmatchedCount = 0;
    let duplicateSkippedCount = 0;

    for (const row of rows) {
      if (existingHashes.has(row.sourceHash)) {
        duplicateSkippedCount++;
        continue;
      }
      existingHashes.add(row.sourceHash); // phòng file có dòng lặp y hệt ngay trong chính nó

      const candidateInvoices = row.customerCode ? invoicesByCode.get(row.customerCode) ?? [] : [];
      const plan = planPaymentAllocation(
        { amount: row.amount, candidateInvoiceNumbers: row.candidateInvoiceNumbers },
        candidateInvoices
      );

      await prisma.$transaction(async (tx) => {
        const payment = await tx.debtPayment.create({
          data: {
            paymentDate: row.paymentDate,
            customerCode: row.customerCode,
            customerName: row.customerName,
            rawDescription: row.rawDescription,
            amount: row.amount,
            note: row.note,
            matchStatus: plan.matchStatus,
            importBatchId: batch.id,
            sourceHash: row.sourceHash,
          },
        });
        for (const alloc of plan.allocations) {
          await tx.debtPaymentAllocation.create({
            data: { paymentId: payment.id, invoiceId: alloc.invoiceId, amount: alloc.amount, matchMethod: alloc.matchMethod },
          });
          await tx.debtInvoice.update({
            where: { id: alloc.invoiceId },
            data: { paidAmount: { increment: alloc.amount } },
          });
        }
      });

      // Cập nhật remaining trong bộ nhớ cho các dòng tiếp theo của cùng khách trong file này.
      for (const alloc of plan.allocations) {
        const inv = candidateInvoices.find((i) => i.id === alloc.invoiceId);
        if (inv) inv.remaining -= alloc.amount;
      }

      if (plan.matchStatus === "MATCHED") matchedCount++;
      else if (plan.matchStatus === "PARTIAL") partialCount++;
      else unmatchedCount++;
    }

    await prisma.debtImportBatch.update({
      where: { id: batch.id },
      data: { createdCount: rows.length - duplicateSkippedCount, updatedCount: matchedCount + partialCount },
    });

    return NextResponse.json({
      batchId: batch.id,
      totalRows: rows.length,
      errorCount: errors.length,
      errors,
      matchedCount,
      partialCount,
      unmatchedCount,
      duplicateSkippedCount,
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/import/payments/commit error", err);
    const message = err instanceof Error ? err.message : "Ghi nhận Tiền về thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
