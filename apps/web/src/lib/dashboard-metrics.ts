import { prisma, getPoAggregates } from "@hoanggia/db";

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
  // "Doanh số" thực hiện — tính theo GIÁ TRỊ ĐÃ GIAO trong tháng, lấy từ file theo dõi PO độc
  // lập anh Quân nhập tay (PoDeliveryEvent — tách đúng từng đợt giao thật, chính xác hơn hẳn
  // deliveredValue luỹ kế từ AMIS). Đây là số dùng để so KPI/chỉ tiêu.
  actualRevenue: number;
  // Giá trị PO đặt hàng trong tháng — tính theo ngày ĐẶT PO (PoTrackingLine.poDate), cùng
  // nguồn với "Doanh số" (độc lập AMIS). Tách riêng vì 2 số đo 2 việc khác nhau: đặt hàng vs
  // giao hàng.
  poValue: number;
  // OIH ("Order In Hand" — giá trị hàng chưa giao) — TOÀN BỘ giá trị còn lại của MỌI PO đang mở
  // của nhân viên này, KHÔNG giới hạn theo tháng đặt PO (đúng theo anh Quân xác nhận: OIH tính
  // cả hàng chưa giao của các tháng trước, không riêng tháng đang xem). Dùng chung
  // getPoAggregates với Tiến độ giao hàng để không lệch số giữa 2 trang.
  oihValue: number;
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
  // includeInSalesStats: true loại các tài khoản có gán mã AMIS chỉ để nhận đồng bộ đơn (vd
  // tài khoản quản trị hệ thống) chứ không phải nhân viên kinh doanh thật — nếu không sẽ bị
  // cộng nhầm doanh số vào tổng, gây lệch số với trang Tiến độ giao hàng (chỉ tính đúng nhân
  // viên thật).
  const employees = await prisma.user.findMany({
    where: {
      active: true,
      amisEmployeeCode: { not: null },
      includeInSalesStats: true,
      ...(onlyEmployeeId ? { id: onlyEmployeeId } : {}),
    },
    select: { id: true, name: true },
  });

  const [targets, deliveredByEmployee, poLines, poAggregates] = await Promise.all([
    prisma.salesTarget.findMany({ where: { year, month } }),
    // "Doanh số" = tổng giá trị các đợt giao THẬT trong tháng này (PoDeliveryEvent — nhập tay
    // từ file theo dõi PO độc lập, không qua AMIS). Mỗi đợt giao có ngày riêng nên đơn giao
    // nhiều đợt trải nhiều tháng được tách đúng theo từng tháng, không dồn/xáo trộn như dữ
    // liệu suy ra từ AMIS trước đây.
    prisma.poDeliveryEvent.groupBy({
      by: ["salesEmployeeId"],
      where: { eventDate: { gte: start, lt: end }, salesEmployeeId: { not: null } },
      _sum: { value: true },
    }),
    // "Giá trị PO đặt hàng" = tổng G.Trị PO của các dòng có ngày đặt PO (poDate) trong tháng.
    prisma.poTrackingLine.groupBy({
      by: ["salesEmployeeId"],
      where: { poDate: { gte: start, lt: end }, salesEmployeeId: { not: null } },
      _sum: { poValue: true },
    }),
    // OIH — TOÀN BỘ PO đang mở của nhân viên, không lọc theo poDate (xem giải thích ở
    // EmployeeTargetVsActual.oihValue).
    getPoAggregates(onlyEmployeeId ? { salesEmployeeId: onlyEmployeeId } : {}),
  ]);

  const targetMap = new Map(targets.map((t) => [t.employeeId, Number(t.targetRevenue)]));
  const revenueMap = new Map(deliveredByEmployee.map((r) => [r.salesEmployeeId as string, Number(r._sum.value ?? 0)]));
  const poMap = new Map(poLines.map((r) => [r.salesEmployeeId as string, Number(r._sum.poValue ?? 0)]));

  const oihMap = new Map<string, number>();
  for (const p of poAggregates) {
    if (!p.isOpen || !p.salesEmployeeId) continue;
    oihMap.set(p.salesEmployeeId, (oihMap.get(p.salesEmployeeId) ?? 0) + p.remainingValue);
  }

  return employees.map((e) => {
    const targetRevenue = targetMap.get(e.id) ?? 0;
    const actualRevenue = revenueMap.get(e.id) ?? 0;
    const poValue = poMap.get(e.id) ?? 0;
    const oihValue = oihMap.get(e.id) ?? 0;
    return {
      employeeId: e.id,
      employeeName: e.name,
      year,
      month,
      targetRevenue,
      actualRevenue,
      poValue,
      oihValue,
      completionPct: targetRevenue > 0 ? Math.round((actualRevenue / targetRevenue) * 100) : null,
    };
  });
}

export interface PoValueTrendMonth {
  year: number;
  month: number;
  label: string;
}
export interface PoValueTrendRow {
  employeeId: string;
  employeeName: string;
  // Cùng thứ tự với PoValueTrend.months (CŨ → MỚI, tháng cuối = tháng đang xem).
  values: number[];
}
export interface PoValueTrend {
  months: PoValueTrendMonth[];
  rows: PoValueTrendRow[];
  totals: number[]; // cùng thứ tự months
}

/**
 * Bảng "PO lên trong tháng" so sánh tháng đang xem với `monthsBack` tháng trước đó, theo từng
 * nhân viên — cùng số đo "Giá trị PO đặt hàng" (poDate) đã dùng ở getEmployeeTargetVsActual,
 * chỉ khác là trải ra nhiều tháng để so sánh thay vì 1 tháng.
 */
export async function getPoValueTrendByEmployee(
  year: number,
  month: number,
  monthsBack: number = 2,
  onlyEmployeeId?: string
): Promise<PoValueTrend> {
  const months: { year: number; month: number }[] = [];
  for (let i = monthsBack; i >= 0; i--) {
    let y = year;
    let m = month - i;
    while (m < 1) {
      m += 12;
      y -= 1;
    }
    months.push({ year: y, month: m });
  }

  const earliestStart = monthRange(months[0].year, months[0].month).start;
  const latestEnd = monthRange(months[months.length - 1].year, months[months.length - 1].month).end;

  const employees = await prisma.user.findMany({
    where: {
      active: true,
      amisEmployeeCode: { not: null },
      includeInSalesStats: true,
      ...(onlyEmployeeId ? { id: onlyEmployeeId } : {}),
    },
    select: { id: true, name: true },
  });

  const lines = await prisma.poTrackingLine.findMany({
    where: { poDate: { gte: earliestStart, lt: latestEnd }, salesEmployeeId: { not: null } },
    select: { salesEmployeeId: true, poDate: true, poValue: true },
  });

  const bucket = new Map<string, number>(); // key = `${employeeId}::${year}-${month}`
  for (const l of lines) {
    if (!l.poDate) continue;
    const key = `${l.salesEmployeeId}::${l.poDate.getFullYear()}-${l.poDate.getMonth() + 1}`;
    bucket.set(key, (bucket.get(key) ?? 0) + Number(l.poValue));
  }

  const monthMetas = months.map((m) => ({ ...m, label: `Tháng ${m.month}/${m.year}` }));
  const rows: PoValueTrendRow[] = employees.map((e) => ({
    employeeId: e.id,
    employeeName: e.name,
    values: months.map((m) => bucket.get(`${e.id}::${m.year}-${m.month}`) ?? 0),
  }));
  const totals = months.map((_, idx) => rows.reduce((s, r) => s + r.values[idx], 0));

  return { months: monthMetas, rows, totals };
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

  // "Thực hiện" ở mọi basis (PRODUCT/PRODUCT_GROUP/EMPLOYEE_TOTAL) đều tính theo tổng giá trị
  // các đợt giao THẬT trong tháng này (PoDeliveryEvent — xem getEmployeeTargetVsActual).
  const employeeTotals = await prisma.poDeliveryEvent.groupBy({
    by: ["salesEmployeeId"],
    where: { eventDate: { gte: start, lt: end }, salesEmployeeId: { not: null } },
    _sum: { value: true },
  });
  const employeeTotalMap = new Map(employeeTotals.map((r) => [r.salesEmployeeId as string, Number(r._sum.value ?? 0)]));

  // Mỗi PoDeliveryEvent đã gắn liền với đúng 1 dòng PO (1 mã hàng) — không cần suy đoán/phân
  // bổ theo tỷ lệ như dữ liệu AMIS trước đây, cộng dồn trực tiếp theo mã hàng.
  const events = await prisma.poDeliveryEvent.findMany({
    where: { eventDate: { gte: start, lt: end }, salesEmployeeId: { not: null } },
    select: {
      value: true,
      quantity: true,
      salesEmployeeId: true,
      line: { select: { itemCode: true } },
    },
  });
  const productMap = new Map<string, { revenue: number; quantity: number }>();
  // Doanh số thực hiện theo nhân viên x Nhóm hàng, phân loại theo đúng quy tắc thật của công
  // ty: mã hàng bắt đầu bằng SI hoặc SB là hàng sản xuất, còn lại là hàng thương mại. Dòng
  // không có mã hàng (khá phổ biến trong file theo dõi PO) bị bỏ qua ở đây — vẫn được tính
  // vào EMPLOYEE_TOTAL ở trên.
  const employeeGroupMap = new Map<string, { production: number; trading: number }>();
  for (const ev of events) {
    const salesEmployeeId = ev.salesEmployeeId;
    const itemCode = ev.line.itemCode;
    if (!salesEmployeeId || !itemCode) continue;
    const value = Number(ev.value);
    const key = `${salesEmployeeId}::${itemCode}`;
    const cur = productMap.get(key) ?? { revenue: 0, quantity: 0 };
    cur.revenue += value;
    cur.quantity += Number(ev.quantity);
    productMap.set(key, cur);

    const upperCode = itemCode.toUpperCase();
    const isProduction = upperCode.startsWith("SI") || upperCode.startsWith("SB");
    const g = employeeGroupMap.get(salesEmployeeId) ?? { production: 0, trading: 0 };
    if (isProduction) g.production += value;
    else g.trading += value;
    employeeGroupMap.set(salesEmployeeId, g);
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
