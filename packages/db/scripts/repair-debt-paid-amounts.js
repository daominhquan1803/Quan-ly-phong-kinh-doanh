// Chạy 1 lần: sửa lỗi "Nhập công nợ gốc" (baseline import) từng ghi đè paidAmount của hoá đơn ĐÃ
// tồn tại về đúng giá trị trong file gốc, xoá mất phần đã cộng qua "Cập nhật Tiền về" trước đó
// (route baseline cũ dùng chung `data` — gồm cả paidAmount — cho cả nhánh create lẫn update; đã
// sửa route để không đụng paidAmount khi update, xem apps/web/src/app/api/debt/import/baseline/route.ts).
// Đưa paidAmount của MỌI hoá đơn về đúng tổng các DebtPaymentAllocation đã ghi nhận thật (nguồn sự
// thật duy nhất), không đụng gì khác — an toàn chạy lại nhiều lần (idempotent).
// Dùng: node packages/db/scripts/repair-debt-paid-amounts.js
const { prisma } = require("../dist/index.js");

async function main() {
  const invoices = await prisma.debtInvoice.findMany({
    select: {
      id: true,
      customerCode: true,
      invoiceNumber: true,
      paidAmount: true,
      allocations: { select: { amount: true } },
    },
  });

  let fixedCount = 0;
  for (const inv of invoices) {
    const correctPaid = inv.allocations.reduce((s, a) => s + Number(a.amount), 0);
    const currentPaid = Number(inv.paidAmount);
    if (Math.abs(correctPaid - currentPaid) > 0.01) {
      await prisma.debtInvoice.update({ where: { id: inv.id }, data: { paidAmount: correctPaid } });
      console.log(`FIX ${inv.customerCode}/${inv.invoiceNumber}: paidAmount ${currentPaid} -> ${correctPaid}`);
      fixedCount++;
    }
  }

  console.log(`Done. ${invoices.length} hoá đơn kiểm tra, sửa ${fixedCount} hoá đơn lệch paidAmount.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
