import { NextResponse } from "next/server";
import { prisma, normalizeCustomerCode } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { duplicateGroups, VISIBLE_CUSTOMER } from "@/lib/customer-merge";

export const dynamic = "force-dynamic";

/** Các nhóm khách đang dùng bị trùng tên, kèm số hoá đơn / đơn hàng / lần chăm sóc của từng mã. NVKD chỉ thấy khách của mình. */
export async function GET() {
  try {
    const session = await requireSession();
    const customers = await prisma.customer.findMany({
      where: { ...scopeByOwner(session, "salesEmployeeId"), ...VISIBLE_CUSTOMER },
      select: { id: true, customerCode: true, customerName: true, salesEmployee: { select: { name: true } }, _count: { select: { careLogs: true } } },
      orderBy: { customerName: "asc" },
    });
    const groups = duplicateGroups(customers);
    const [invoices, orders] = await Promise.all([
      prisma.debtInvoice.groupBy({ by: ["customerCode"], _count: { _all: true } }),
      prisma.order.groupBy({ by: ["customerCode"], _count: { _all: true } }),
    ]);
    const countBy = (rows: { customerCode: string | null; _count: { _all: number } }[]) => {
      const m = new Map<string, number>();
      for (const r of rows) {
        const k = normalizeCustomerCode(r.customerCode);
        if (k) m.set(k, (m.get(k) ?? 0) + r._count._all);
      }
      return m;
    };
    const inv = countBy(invoices);
    const ord = countBy(orders);
    return NextResponse.json({
      groups: groups.map((g) =>
        g.map((c) => ({
          id: c.id,
          customerCode: c.customerCode,
          customerName: c.customerName,
          salesEmployeeName: c.salesEmployee?.name ?? null,
          invoices: inv.get(normalizeCustomerCode(c.customerCode)) ?? 0,
          orders: ord.get(normalizeCustomerCode(c.customerCode)) ?? 0,
          careLogs: c._count.careLogs,
        }))
      ),
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("customers/duplicates GET error", err);
    return NextResponse.json({ error: "Không tải được danh sách khách trùng" }, { status: 500 });
  }
}
