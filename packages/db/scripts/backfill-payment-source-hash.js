// Chạy 1 lần sau migration thêm cột nullable "sourceHash": gộp các DebtPayment TRÙNG NỘI DUNG
// (cùng ngày + mã KH + số tiền + mô tả — do admin lỡ up lại đúng file "Tiền về", trước khi có
// khoá chống trùng) về đúng 1 bản ghi, đảo ngược đúng phần paidAmount đã cộng trùng vào hoá đơn,
// rồi điền sourceHash cho toàn bộ bản ghi còn lại (chuẩn bị cho migration tiếp theo: NOT NULL + UNIQUE).
// Dùng: node packages/db/scripts/backfill-payment-source-hash.js
const crypto = require("crypto");
const { prisma } = require("../dist/index.js");

function computeSourceHash({ paymentDate, customerCode, amount, rawDescription }) {
  const key = [paymentDate ? paymentDate.toISOString() : "", customerCode ?? "", amount, rawDescription ?? ""].join("|");
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function main() {
  // select tường minh, KHÔNG lấy sourceHash — cột này còn NULL ở bước backfill (chưa SET NOT
  // NULL), mà Prisma Client đã generate theo schema MỚI (String bắt buộc) nên nếu vô tình trả về
  // sẽ validate lỗi ngay khi đọc (P2032). Không cần giá trị cũ của nó ở đây, chỉ cần tính lại.
  const payments = await prisma.debtPayment.findMany({
    select: {
      id: true,
      paymentDate: true,
      customerCode: true,
      amount: true,
      rawDescription: true,
      createdAt: true,
      allocations: { select: { invoiceId: true, amount: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map();
  for (const p of payments) {
    const hash = computeSourceHash({
      paymentDate: p.paymentDate,
      customerCode: p.customerCode,
      amount: Number(p.amount),
      rawDescription: p.rawDescription,
    });
    const list = groups.get(hash) ?? [];
    list.push({ record: p, hash });
    groups.set(hash, list);
  }

  let dupPaymentsDeleted = 0;
  let totalReversed = 0;

  for (const [hash, list] of groups) {
    if (list.length <= 1) continue;
    const [keep, ...dupes] = list;
    console.log(
      `DUP GROUP hash=${hash.slice(0, 10)} keep=${keep.record.id} (${keep.record.paymentDate?.toISOString().slice(0, 10)}, ${keep.record.customerCode}, ${keep.record.amount}) dupes=${dupes.map((d) => d.record.id).join(",")}`
    );
    for (const dup of dupes) {
      for (const alloc of dup.record.allocations) {
        await prisma.debtInvoice.update({
          where: { id: alloc.invoiceId },
          data: { paidAmount: { decrement: alloc.amount } },
        });
        totalReversed += Number(alloc.amount);
        console.log(`  reverse invoice=${alloc.invoiceId} amount=${alloc.amount}`);
      }
      // select: { id: true } — tránh Prisma trả về (và validate) cả cột sourceHash đang NULL của
      // bản ghi vừa xoá, cùng lý do P2032 như findMany() ở trên.
      await prisma.debtPayment.delete({ where: { id: dup.record.id }, select: { id: true } }); // cascade xoá allocations
      dupPaymentsDeleted++;
    }
  }

  const remaining = await prisma.debtPayment.findMany({
    select: { id: true, paymentDate: true, customerCode: true, amount: true, rawDescription: true },
  });
  for (const p of remaining) {
    const hash = computeSourceHash({
      paymentDate: p.paymentDate,
      customerCode: p.customerCode,
      amount: Number(p.amount),
      rawDescription: p.rawDescription,
    });
    await prisma.debtPayment.update({ where: { id: p.id }, data: { sourceHash: hash }, select: { id: true } });
  }

  console.log(`Done. Tổng: ${payments.length} payment ban đầu -> xoá ${dupPaymentsDeleted} bản trùng, đảo ngược ${totalReversed}đ paidAmount cộng trùng. Đã điền sourceHash cho ${remaining.length} bản ghi còn lại.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
