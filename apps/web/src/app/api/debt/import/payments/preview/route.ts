import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@hoanggia/db";
import { parseDebtPaymentsExcel } from "@/lib/debt-payments-parser";
import { remainingAmount } from "@/lib/debt-status";
import { planPaymentAllocation } from "@/lib/debt-payment-allocation";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();

    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Thiếu file" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, errors } = parseDebtPaymentsExcel(buffer);

    const codes = Array.from(new Set(rows.map((r) => r.customerCode).filter((c): c is string => !!c)));
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

    // Báo trước cho admin biết dòng nào TRÙNG với giao dịch đã ghi nhận từ lần nhập trước (vd lỡ
    // up lại đúng file) — xem DebtPayment.sourceHash.
    const existingHashes = new Set(
      (
        await prisma.debtPayment.findMany({
          where: { sourceHash: { in: rows.map((r) => r.sourceHash) } },
          select: { sourceHash: true },
        })
      ).map((p) => p.sourceHash)
    );

    const preview = rows.map((row) => {
      const candidateInvoices = row.customerCode ? invoicesByCode.get(row.customerCode) ?? [] : [];
      const plan = planPaymentAllocation(
        { amount: row.amount, candidateInvoiceNumbers: row.candidateInvoiceNumbers },
        candidateInvoices
      );
      return {
        rowNumber: row.rowNumber,
        paymentDate: row.paymentDate,
        customerCodeRaw: row.customerCodeRaw,
        customerName: row.customerName,
        rawDescription: row.rawDescription,
        amount: row.amount,
        matchStatus: plan.matchStatus,
        allocations: plan.allocations,
        unallocatedAmount: plan.unallocatedAmount,
        isDuplicate: existingHashes.has(row.sourceHash),
      };
    });

    const summary = {
      matched: preview.filter((p) => p.matchStatus === "MATCHED").length,
      partial: preview.filter((p) => p.matchStatus === "PARTIAL").length,
      unmatched: preview.filter((p) => p.matchStatus === "UNMATCHED").length,
      duplicate: preview.filter((p) => p.isDuplicate).length,
    };

    return NextResponse.json({ totalRows: rows.length, errorCount: errors.length, errors, rows: preview, summary });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("debt/import/payments/preview error", err);
    const message = err instanceof Error ? err.message : "Đọc file Tiền về thất bại.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
