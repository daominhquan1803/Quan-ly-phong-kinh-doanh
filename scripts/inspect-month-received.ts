/**
 * CHI DOC - doi chieu "Tong tien ve trong thang" (DebtPayment) vs "Ca thang" da thu (allocation) cua 1 thang.
 * Liet ke khoan Tien ve co phan CHUA khop vao hoa don (amount > tong allocation) va khoan bi IGNORED.
 * Chay: npx tsx scripts/inspect-month-received.ts <nam> <thang>   vd: 2026 10
 */
import { prisma } from "@hoanggia/db";

async function main() {
  const year = Number(process.argv[2]);
  const month = Number(process.argv[3]);
  if (!year || !month) throw new Error("Thieu nam/thang");
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const payments = await prisma.debtPayment.findMany({
    where: { paymentDate: { gte: start, lte: end } },
    select: {
      id: true, amount: true, paymentDate: true, matchStatus: true, customerCode: true, sourceHash: true,
      allocations: { select: { amount: true, invoice: { select: { invoiceNumber: true, salesEmployee: { select: { name: true } } } } } },
    },
    orderBy: { paymentDate: "asc" },
  });
  let total = 0, totalNoIgnored = 0, allocated = 0, ignored = 0;
  const gaps: string[] = [];
  for (const p of payments) {
    const amt = Number(p.amount);
    const alloc = p.allocations.reduce((s, a) => s + Number(a.amount), 0);
    total += amt;
    if (p.matchStatus === "IGNORED") { ignored += amt; continue; }
    totalNoIgnored += amt;
    allocated += alloc;
    if (amt - alloc !== 0) {
      const d = new Date(p.paymentDate!.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
      gaps.push(`  ${d} | ${p.customerCode ?? "-"} | ${p.matchStatus} | amt=${amt} alloc=${alloc} chenh=${amt - alloc} | ${p.sourceHash.startsWith("manual:") ? "TAY" : "FILE"} | HD: ${p.allocations.map((a) => a.invoice.invoiceNumber).join(",") || "-"}`);
    }
  }
  console.log(`Thang ${month}/${year}: ${payments.length} khoan Tien ve`);
  console.log(`Tong tat ca=${total} | IGNORED=${ignored} | tru IGNORED=${totalNoIgnored} (so "Tong tien ve trong thang")`);
  console.log(`Tong da khop vao hoa don (cua khoan khong IGNORED)=${allocated} | chenh=${totalNoIgnored - allocated}`);
  console.log(`Khoan co phan chua khop (${gaps.length}):`);
  gaps.forEach((g) => console.log(g));
}
main().finally(() => prisma.$disconnect());
