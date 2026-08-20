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
  // PRODUCT: khớp đúng theo mã hàng. PRODUCT_GROUP: dòng kế hoạch không có mã hàng cụ thể
  // nhưng có Nhóm hàng (Sản xuất/Thương mại) — thực hiện lấy theo đúng nhóm, phân loại từng
  // OrderItem theo tiền tố mã hàng thật (SI/SB = Sản xuất, còn lại = Thương mại). EMPLOYEE_TOTAL:
  // dòng không xác định được nhóm hàng — tạm lấy tổng doanh số nhân viên trong tháng làm số
  // liệu tham chiếu gần đúng nhất.
  actualBasis: "PRODUCT" | "PRODUCT_GROUP" | "EMPLOYEE_TOTAL" | "UNRESOLVED";
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
  // Doanh số thực hiện theo nhân viên x Nhóm hàng, phân loại theo đúng quy tắc thật của công
  // ty: mã hàng bắt đầu bằng SI hoặc SB là hàng sản xuất, còn lại là hàng thương mại.
  const employeeGroupMap = new Map<string, { production: number; trading: number }>();
  for (const it of items) {
    if (!it.itemCode || !it.order.salesEmployeeId) continue;
    const key = `${it.order.salesEmployeeId}::${it.itemCode}`;
    const cur = productMap.get(key) ?? { revenue: 0, quantity: 0 };
    cur.revenue += Number(it.totalPrice);
    cur.quantity += Number(it.quantity);
    productMap.set(key, cur);

    const upperCode = it.itemCode.toUpperCase();
    const isProduction = upperCode.startsWith("SI") || upperCode.startsWith("SB");
    const g = employeeGroupMap.get(it.order.salesEmployeeId) ?? { production: 0, trading: 0 };
    if (isProduction) g.production += Number(it.totalPrice);
    else g.trading += Number(it.totalPrice);
    employeeGroupMap.set(it.order.salesEmployeeId, g);
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
    } else if (l.employeeId && (l.productGroup === "Sản xuất" || l.productGroup === "Thương mại")) {
      const g = employeeGroupMap.get(l.employeeId);
      actualRevenue = l.productGroup === "Sản xuất" ? g?.production ?? 0 : g?.trading ?? 0;
      actualBasis = "PRODUCT_GROUP";
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

export interface ProductGroupTargetVsActual {
  group: string; // "Sản xuất" | "Thương mại" | "Khác"
  targetRevenue: number;
  actualRevenue: number;
  completionPct: number | null;
}

/**
 * Kế hoạch vs thực hiện gộp theo Nhóm hàng (Sản xuất/Thương mại) — dùng cho biểu đồ ở trang
 * Tổng quan. Cùng logic gộp với trang Kế hoạch kinh doanh (xem SalesPlanDetailSection.tsx):
 * với basis PRODUCT_GROUP/EMPLOYEE_TOTAL, thực hiện là *cùng 1 con số* lặp lại trên mọi dòng
 * sản phẩm của 1 nhân viên trong nhóm đó — nên phải gộp theo nhân viên trước (lấy 1 lần) rồi
 * mới cộng giữa các nhân viên, nếu không sẽ bị nhân đôi/ba theo số dòng sản phẩm.
 */
export async function getProductGroupTargetVsActual(
  year: number,
  month: number,
  onlyEmployeeId?: string
): Promise<ProductGroupTargetVsActual[]> {
  const lines = await getSalesPlanLinesWithActual(year, month, onlyEmployeeId);
  const order = ["Sản xuất", "Thương mại"];

  const buckets = new Map<string, Map<string, { target: number; productActual: number; groupActual: number | null }>>();
  for (const l of lines) {
    const groupKey = order.includes(l.productGroup ?? "") ? (l.productGroup as string) : "Khác";
    if (!buckets.has(groupKey)) buckets.set(groupKey, new Map());
    const empMap = buckets.get(groupKey)!;
    const empKey = l.employeeId ?? l.employeeName;
    if (!empMap.has(empKey)) empMap.set(empKey, { target: 0, productActual: 0, groupActual: null });
    const b = empMap.get(empKey)!;
    b.target += l.targetRevenue;
    if (l.actualBasis === "PRODUCT") {
      b.productActual += l.actualRevenue;
    } else if (l.actualBasis === "PRODUCT_GROUP" || l.actualBasis === "EMPLOYEE_TOTAL") {
      b.groupActual = l.actualRevenue;
    }
  }

  const names = [...order.filter((n) => buckets.has(n)), ...(buckets.has("Khác") ? ["Khác"] : [])];
  return names.map((name) => {
    const empMap = buckets.get(name)!;
    let targetRevenue = 0;
    let actualRevenue = 0;
    for (const b of empMap.values()) {
      targetRevenue += b.target;
      actualRevenue += b.productActual + (b.groupActual ?? 0);
    }
    return {
      group: name,
      targetRevenue,
      actualRevenue,
      completionPct: targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 100) : null,
    };
  });
}
