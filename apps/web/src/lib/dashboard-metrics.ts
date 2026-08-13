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

  const employees = await prisma.user.findMany({
    where: { role: "SALES", active: true, ...(onlyEmployeeId ? { id: onlyEmployeeId } : {}) },
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
