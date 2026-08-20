import { prisma, OrderStatus } from "@hoanggia/db";

export function monthRange(year: number, month: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);
  return { start, end };
}

export interface EmployeeTargetVsActual {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  targetRevenue: number;
  actualRevenue: number;
  completionPct: number | null;
}

/**
 * Kế hoạch vs thực hiện theo nhân viên cho 1 tháng — dùng chung cho trang Kế hoạch kinh doanh
 * và widget tổng quan ở Dashboard. `onlyEmployeeId` giới hạn kết quả về 1 nhân viên (view của Sales).
 */
export async function getEmployeeTargetVsActual(
  year: number,
  month: number,
  onlyEmployeeId?: string
): Promise<EmployeeTargetVsActual[]> {
  const { start, end } = monthRange(year, month);

  // Lấy theo "có gán mã AMIS" (tức đang thực sự bán hàng, được đồng bộ đơn) chứ không lọc
  // theo vai trò SALES — vì chủ tài khoản có thể vừa là ADMIN vừa trực tiếp bán hàng (vd
  // chủ doanh nghiệp), vẫn cần theo dõi chỉ tiêu cá nhân như một nhân viên kinh doanh.
  const employees = await prisma.user.findMany({
    where: { active: true, amisEmployeeCode: { not: null }, ...(onlyEmployeeId ? { id: onlyEmployeeId } : {}) },
    select: { id: true, name: true },
  });

  const [targets, revenueByEmployee] = await Promise.all([
    prisma.salesTarget.findMany({ where: { year, month } }),
    prisma.order.groupBy({
      by: ["salesEmployeeId"],
      where: {
        orderDate: { gte: start, lt: end },
        status: { not: OrderStatus.CANCELLED },
        salesEmployeeId: { not: null },
      },
      _sum: { totalValue: true },
    }),
  ]);

  const targetMap = new Map(targets.map((t) => [t.employeeId, Number(t.targetRevenue)]));
  const revenueMap = new Map(revenueByEmployee.map((r) => [r.salesEmployeeId as string, Number(r._sum.totalValue ?? 0)]));

  return employees.map((e) => {
    const targetRevenue = targetMap.get(e.id) ?? 0;
    const actualRevenue = revenueMap.get(e.id) ?? 0;
    return {
      employeeId: e.id,
      employeeName: e.name,
      year,
      month,
      targetRevenue,
      actualRevenue,
      completionPct: targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 100) : null,
    };
  });
}

export interface SalesPlanLineWithActual {
  id: string;
  employeeId: string | null;
  employeeName: string;
  productCode: string | null;
  productName: string | null;
  productGroup: string | null;
  targetRevenue: number;
  targetQuantity: number | null;
  actualRevenue: number;
  actualQuantity: number | null;
  // PRODUCT: khớp đúng theo mã hàng. EMPLOYEE_TOTAL: dòng không có mã hàng cụ thể (vd theo
  // nhóm hàng) nên tạm lấy tổng doanh số nhân viên trong tháng làm số liệu tham chiếu gần
  // đúng nhất — chưa có dữ liệu nhóm hàng ở cấp từng mặt hàng để tính chính xác hơn.
  actualBasis: "PRODUCT" | "EMPLOYEE_TOTAL" | "UNRESOLVED";
  completionPct: number | null;
}

/** Kế hoạch kinh doanh chi tiết (Nhân viên x Sản phẩm/Nhóm hàng) đã import từ Excel, kèm thực hiện. */
export async function getSalesPlanLinesWithActual(
  year: number,
  month: number,
  onlyEmployeeId?: string
): Promise<SalesPlanLineWithActual[]> {
  const { start, end } = monthRange(year, month);

  const lines = await prisma.salesPlanLine.findMany({
    where: { year, month, ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}) },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: [{ employeeId: "asc" }, { productCode: "asc" }],
  });
  if (lines.length === 0) return [];

  const employeeTotals = await prisma.order.groupBy({
    by: ["salesEmployeeId"],
    where: {
      orderDate: { gte: start, lt: end },
      status: { not: OrderStatus.CANCELLED },
      salesEmployeeId: { not: null },
    },
    _sum: { totalValue: true },
  });
  const employeeTotalMap = new Map(employeeTotals.map((r) => [r.salesEmployeeId as string, Number(r._sum.totalValue ?? 0)]));

  const items = await prisma.orderItem.findMany({
    where: {
      order: { orderDate: { gte: start, lt: end }, status: { not: OrderStatus.CANCELLED }, salesEmployeeId: { not: null } },
    },
    select: { itemCode: true, quantity: true, totalPrice: true, order: { select: { salesEmployeeId: true } } },
  });
  const productMap = new Map<string, { revenue: number; quantity: number }>();
  for (const it of items) {
    if (!it.itemCode || !it.order.salesEmployeeId) continue;
    const key = `${it.order.salesEmployeeId}::${it.itemCode}`;
    const cur = productMap.get(key) ?? { revenue: 0, quantity: 0 };
    cur.revenue += Number(it.totalPrice);
    cur.quantity += Number(it.quantity);
    productMap.set(key, cur);
  }

  return lines.map((l) => {
    const targetRevenue = Number(l.targetRevenue);
    let actualRevenue = 0;
    let actualQuantity: number | null = null;
    let actualBasis: SalesPlanLineWithActual["actualBasis"] = "UNRESOLVED";

    if (l.employeeId && l.productCode) {
      const agg = productMap.get(`${l.employeeId}::${l.productCode}`);
      actualRevenue = agg?.revenue ?? 0;
      actualQuantity = agg?.quantity ?? 0;
      actualBasis = "PRODUCT";
    } else if (l.employeeId) {
      actualRevenue = employeeTotalMap.get(l.employeeId) ?? 0;
      actualBasis = "EMPLOYEE_TOTAL";
    }

    return {
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee?.name ?? l.employeeNameRaw ?? "(?)",
      productCode: l.productCode,
      productName: l.productName,
      productGroup: l.productGroup,
      targetRevenue,
      targetQuantity: l.targetQuantity ? Number(l.targetQuantity) : null,
      actualRevenue,
      actualQuantity,
      actualBasis,
      completionPct: targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 100) : null,
    };
  });
}
