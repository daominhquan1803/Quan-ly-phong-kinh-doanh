import { prisma, getPoAggregates } from "@hoanggia/db";
import { getOihLinesAsOf, monthRange } from "./dashboard-metrics";
import { normCode } from "./stats";

// Chi tiết theo KHÁCH của các số trên trang Kế hoạch kinh doanh: "Thực hiện (đã giao)" và OIH của 1 nhân viên trong 1 tháng,
// và thực hiện theo nhóm hàng Sản xuất / Thương mại ở bảng "Kế hoạch chi tiết theo sản phẩm". Cùng luật tính với số tổng
// (getEmployeeTargetVsActual / getSalesPlanLinesWithActual) nên tổng các dòng khớp số trên bảng.

export type BreakdownMetric = "delivered" | "oih";
export type BreakdownGroup = "all" | "Sản xuất" | "Thương mại";

export interface BreakdownItem {
  customerCode: string | null;
  poCode: string;
  value: number;
}

export interface BreakdownRow {
  key: string;
  customerCode: string;
  customerName: string;
  value: number;
  poCount: number;
}

/** Mã hàng bắt đầu bằng SI hoặc SB là hàng Sản xuất, còn lại là Thương mại; không có mã hàng thì không xếp nhóm (cùng luật getSalesPlanLinesWithActual). */
export function groupOfItemCode(itemCode: string | null | undefined): "Sản xuất" | "Thương mại" | null {
  const code = (itemCode ?? "").trim().toUpperCase();
  if (!code) return null;
  return code.startsWith("SI") || code.startsWith("SB") ? "Sản xuất" : "Thương mại";
}

/** Thuần: gộp theo khách (mã chuẩn hoá), sắp theo giá trị giảm dần; dòng không rõ khách gom vào 1 dòng riêng. */
export function groupByCustomer(items: BreakdownItem[], names: Map<string, { code: string; name: string }>): BreakdownRow[] {
  const rows = new Map<string, BreakdownRow & { pos: Set<string> }>();
  for (const it of items) {
    const norm = normCode(it.customerCode);
    const key = norm || "(KHÔNG RÕ KHÁCH)";
    let row = rows.get(key);
    if (!row) {
      const known = names.get(norm);
      row = {
        key,
        customerCode: known?.code ?? (it.customerCode?.trim() || "(không rõ khách)"),
        customerName: known?.name ?? "",
        value: 0,
        poCount: 0,
        pos: new Set(),
      };
      rows.set(key, row);
    }
    row.value += it.value;
    row.pos.add(it.poCode);
  }
  return Array.from(rows.values())
    .map(({ pos, ...r }) => ({ ...r, poCount: pos.size }))
    .sort((a, b) => b.value - a.value || a.customerCode.localeCompare(b.customerCode, "vi"));
}

async function customerNames(): Promise<Map<string, { code: string; name: string }>> {
  const customers = await prisma.customer.findMany({ orderBy: { createdAt: "asc" }, select: { customerCode: true, customerName: true } });
  const map = new Map<string, { code: string; name: string }>();
  for (const c of customers) {
    const k = normCode(c.customerCode);
    if (k && !map.has(k)) map.set(k, { code: c.customerCode, name: c.customerName });
  }
  return map;
}

/**
 * Chi tiết theo khách của 1 nhân viên trong tháng.
 *  - delivered: các đợt giao (PoDeliveryEvent) trong tháng; `group` Sản xuất/Thương mại chỉ lấy dòng có mã hàng thuộc nhóm đó.
 *  - oih: PO còn mở. Tháng đã qua tính ngược về cuối tháng (getOihLinesAsOf), tháng đang chạy lấy số hiện tại (getPoAggregates) — như số OIH trên bảng.
 */
export async function getTargetBreakdown(q: {
  year: number;
  month: number;
  employeeId: string;
  metric: BreakdownMetric;
  group: BreakdownGroup;
}): Promise<{ rows: BreakdownRow[]; total: number }> {
  const { start, end } = monthRange(q.year, q.month);
  let items: BreakdownItem[];

  if (q.metric === "delivered") {
    const events = await prisma.poDeliveryEvent.findMany({
      where: { eventDate: { gte: start, lt: end }, salesEmployeeId: q.employeeId },
      select: { value: true, line: { select: { customerCode: true, poCode: true, itemCode: true } } },
    });
    items = events
      .filter((e) => q.group === "all" || groupOfItemCode(e.line.itemCode) === q.group)
      .map((e) => ({ customerCode: e.line.customerCode, poCode: e.line.poCode, value: Number(e.value) }));
  } else if (end.getTime() <= Date.now()) {
    items = (await getOihLinesAsOf(end, q.employeeId)).map((l) => ({ customerCode: l.customerCode, poCode: l.poCode, value: l.remaining }));
  } else {
    items = (await getPoAggregates({ salesEmployeeId: q.employeeId }))
      .filter((p) => p.isOpen && p.salesEmployeeId === q.employeeId && p.remainingValue > 0)
      .map((p) => ({ customerCode: p.customerCode, poCode: p.poCode, value: p.remainingValue }));
  }

  const rows = groupByCustomer(items, await customerNames());
  return { rows, total: rows.reduce((s, r) => s + r.value, 0) };
}
