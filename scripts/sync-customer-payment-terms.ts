/**
 * Đồng bộ 1 lần: áp quy tắc hạn nợ của từng khách hàng (Customer.paymentTerm*) vào hạn thanh toán
 * (DebtInvoice.dueDate) của mọi hoá đơn còn nợ của khách đó — giống việc API PATCH /api/customers/[id]
 * làm khi anh Quân sửa quy tắc, nhưng chạy cho TẤT CẢ khách (các khách anh sửa trước khi có tính năng
 * tự đồng bộ chưa được áp lại).
 *
 * Mặc định chỉ IN RA (dry-run). Thêm --apply để ghi thật. Hoá đơn đã thanh toán đủ, hoặc thiếu
 * Ngày chứng từ, được bỏ qua.
 * Cách chạy: TZ=Asia/Ho_Chi_Minh npx tsx scripts/sync-customer-payment-terms.ts [--apply]
 */
import { prisma } from "@hoanggia/db";

const apply = process.argv.includes("--apply");

// Bản chép của computeDueDateFromTerm (apps/web/src/lib/customer-payment-term.ts) — script không
// import được code của apps/web.
function computeDue(
  invoiceDate: Date,
  t: { paymentTermType: string | null; paymentTermDays: number | null; paymentTermMonthOffset: number | null }
): Date | null {
  if (t.paymentTermType === "DAYS_FROM_INVOICE" && t.paymentTermDays != null) {
    const d = new Date(invoiceDate);
    d.setDate(d.getDate() + t.paymentTermDays);
    return d;
  }
  if (t.paymentTermType === "END_OF_MONTH_OFFSET" && t.paymentTermMonthOffset != null) {
    return new Date(invoiceDate.getFullYear(), invoiceDate.getMonth() + t.paymentTermMonthOffset + 1, 0);
  }
  return null;
}

const fmt = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");

async function main() {
  console.log(`TZ=${process.env.TZ ?? "(không đặt)"} — ${apply ? "GHI THẬT" : "DRY-RUN (chỉ in ra)"}`);
  const customers = await prisma.customer.findMany({ where: { paymentTermType: { not: null } } });
  console.log(`Khách có quy tắc hạn nợ: ${customers.length} / tổng khách ${await prisma.customer.count()}`);

  let customersWithInvoices = 0;
  let invoicesChecked = 0;
  let invoicesToChange = 0;
  const samples: string[] = [];
  const noInvoiceCodes: string[] = [];

  for (const c of customers) {
    const invoices = await prisma.debtInvoice.findMany({
      where: { customerCode: c.customerCode, invoiceDate: { not: null } },
      select: { id: true, invoiceNumber: true, invoiceDate: true, dueDate: true, originalAmount: true, paidAmount: true },
    });
    if (invoices.length === 0) {
      noInvoiceCodes.push(c.customerCode);
      continue;
    }
    customersWithInvoices++;
    for (const inv of invoices) {
      if (Number(inv.originalAmount) - Number(inv.paidAmount) <= 0) continue;
      invoicesChecked++;
      const due = computeDue(inv.invoiceDate as Date, c);
      if (!due || inv.dueDate?.getTime() === due.getTime()) continue;
      invoicesToChange++;
      if (samples.length < 20) {
        samples.push(
          `${c.customerCode} HĐ ${inv.invoiceNumber} chứng từ ${fmt(inv.invoiceDate)}: hạn ${fmt(inv.dueDate)} -> ${fmt(due)} (quy tắc ${c.paymentTermType} ${c.paymentTermDays ?? c.paymentTermMonthOffset})`
        );
      }
      if (apply) await prisma.debtInvoice.update({ where: { id: inv.id }, data: { dueDate: due } });
    }
  }

  console.log(`Khách có hoá đơn công nợ khớp mã: ${customersWithInvoices}`);
  console.log(`Khách có quy tắc nhưng KHÔNG có hoá đơn nào khớp mã (mẫu 10): ${noInvoiceCodes.length} — ${noInvoiceCodes.slice(0, 10).join(", ")}`);
  console.log(`Hoá đơn còn nợ đã xét: ${invoicesChecked}; cần đổi hạn: ${invoicesToChange}${apply ? " (đã ghi)" : ""}`);
  samples.forEach((s) => console.log("  " + s));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
