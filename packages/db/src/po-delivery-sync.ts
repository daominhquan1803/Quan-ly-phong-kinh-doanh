import { prisma } from "./index";

export const PO_CLOSED_STATUS = "kết thúc";
export function normPoStatus(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

export interface SlipAgg {
  qty: number;
  value: number;
}

/** Tổng SL/giá trị các đợt giao do Phiếu đi hàng sinh ra (sourceShipmentSlipId khác null) của
 * TỪNG dòng PO — 1 query duy nhất, dùng cho việc nhập hàng loạt file PO tracking (23K+ dòng)
 * để tránh N+1 query khi tính lại từng dòng. */
export async function getSlipAggForAllLines(): Promise<Map<string, SlipAgg>> {
  const rows = await prisma.poDeliveryEvent.groupBy({
    by: ["lineId"],
    where: { sourceShipmentSlipId: { not: null } },
    _sum: { quantity: true, value: true },
  });
  return new Map(rows.map((r) => [r.lineId, { qty: Number(r._sum.quantity ?? 0), value: Number(r._sum.value ?? 0) }]));
}

async function getSlipAggForLine(lineId: string): Promise<SlipAgg> {
  const agg = await prisma.poDeliveryEvent.aggregate({
    where: { lineId, sourceShipmentSlipId: { not: null } },
    _sum: { quantity: true, value: true },
  });
  return { qty: Number(agg._sum.quantity ?? 0), value: Number(agg._sum.value ?? 0) };
}

export interface LineDeliveryFields {
  deliveredValue: number;
  remainingValue: number;
  totalDeliveredQty: number;
  remainingQty: number | null;
  statusRaw: string;
}

/**
 * Tính deliveredValue/remainingValue/totalDeliveredQty/remainingQty/statusRaw của 1 dòng PO =
 * "nền" (baselineDeliveredValue/baselineDeliveredQty/baselineClosed — từ lần nhập file PO
 * tracking Excel gần nhất) CỘNG THÊM tổng các đợt giao do Phiếu đi hàng sinh ra. Nhờ tách
 * riêng "nền", nhập lại file PO tracking (ghi đè nền) không làm mất phần đã giao qua Phiếu đi
 * hàng đã ghi nhận sau đó.
 */
export function computeLineDeliveryFields(
  line: {
    poValue: number;
    poQuantity: number | null;
    baselineDeliveredValue: number;
    baselineDeliveredQty: number | null;
    baselineClosed: boolean;
  },
  slipAgg: SlipAgg
): LineDeliveryFields {
  const deliveredValue = line.baselineDeliveredValue + slipAgg.value;
  const totalDeliveredQty = (line.baselineDeliveredQty ?? 0) + slipAgg.qty;
  const remainingValue = Math.max(line.poValue - deliveredValue, 0);
  const remainingQty = line.poQuantity != null ? Math.max(line.poQuantity - totalDeliveredQty, 0) : null;
  const fullyDelivered = line.poQuantity != null ? totalDeliveredQty >= line.poQuantity : deliveredValue >= line.poValue;
  const statusRaw = line.baselineClosed || fullyDelivered ? "Kết thúc" : "Đang thực hiện";
  return { deliveredValue, remainingValue, totalDeliveredQty, remainingQty, statusRaw };
}

/** Tính lại và ghi đè các trường tình trạng giao hàng của 1 dòng PO — dùng sau khi 1 Phiếu đi
 * hàng sinh/xoá đợt giao gắn với dòng đó. */
export async function recomputeLineDeliveryFields(lineId: string): Promise<void> {
  const line = await prisma.poTrackingLine.findUnique({
    where: { id: lineId },
    select: { id: true, poValue: true, poQuantity: true, baselineDeliveredValue: true, baselineDeliveredQty: true, baselineClosed: true },
  });
  if (!line) return;
  const slipAgg = await getSlipAggForLine(lineId);
  const fields = computeLineDeliveryFields(
    {
      poValue: Number(line.poValue),
      poQuantity: line.poQuantity != null ? Number(line.poQuantity) : null,
      baselineDeliveredValue: Number(line.baselineDeliveredValue),
      baselineDeliveredQty: line.baselineDeliveredQty != null ? Number(line.baselineDeliveredQty) : null,
      baselineClosed: line.baselineClosed,
    },
    slipAgg
  );
  await prisma.poTrackingLine.update({ where: { id: lineId }, data: fields });
}

export interface ShipmentSlipDeliveryItem {
  itemCode: string | null;
  itemName: string;
  poSaleNumber: string | null;
  qtyActual: number | null;
}

export interface ApplyShipmentSlipResult {
  matchedCount: number;
  unmatchedItems: string[];
}

/**
 * Đồng bộ đợt giao từ 1 Phiếu đi hàng vào các dòng PO tracking tương ứng — khớp theo Số PO
 * (poSaleNumber = PoTrackingLine.poCode) + Mã hàng (hoặc Tên hàng nếu thiếu mã), CHỈ áp dụng
 * khi khớp đúng 1 dòng (không suy đoán khi mơ hồ/không tìm thấy — liệt kê vào unmatchedItems
 * để người dùng biết). Giá trị giao = SL thực xuất × đơn giá (Giá HĐ của dòng PO, hoặc suy ra
 * G.Trị PO / SL PO nếu thiếu Giá HĐ) — bỏ qua nếu không có cách nào tính được đơn giá.
 *
 * Xoá hết các đợt giao CŨ do CHÍNH phiếu này sinh ra trước khi tạo lại — để nhập lại/sửa phiếu
 * không bị tính trùng.
 */
export async function applyShipmentSlipDeliveries(
  slipId: string,
  slipDate: Date | null,
  items: ShipmentSlipDeliveryItem[]
): Promise<ApplyShipmentSlipResult> {
  const previouslyTouchedLines = await prisma.poDeliveryEvent.findMany({
    where: { sourceShipmentSlipId: slipId },
    select: { lineId: true },
    distinct: ["lineId"],
  });
  await prisma.poDeliveryEvent.deleteMany({ where: { sourceShipmentSlipId: slipId } });

  const touchedLineIds = new Set<string>(previouslyTouchedLines.map((r) => r.lineId));
  const unmatchedItems: string[] = [];
  let matchedCount = 0;

  for (const item of items) {
    if (!item.poSaleNumber || !item.qtyActual || item.qtyActual <= 0) continue;

    const candidates = await prisma.poTrackingLine.findMany({
      where: {
        poCode: item.poSaleNumber,
        ...(item.itemCode ? { itemCode: item.itemCode } : { itemName: item.itemName }),
      },
      select: { id: true, contractPrice: true, poValue: true, poQuantity: true, salesEmployeeId: true },
    });
    if (candidates.length !== 1) {
      unmatchedItems.push(
        `${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (${candidates.length === 0 ? "không tìm thấy dòng PO khớp" : "khớp nhiều dòng, không rõ dòng nào"})`
      );
      continue;
    }
    const line = candidates[0];
    const poQuantity = line.poQuantity != null ? Number(line.poQuantity) : null;
    const unitPrice =
      line.contractPrice != null
        ? Number(line.contractPrice)
        : poQuantity != null && poQuantity > 0
        ? Number(line.poValue) / poQuantity
        : null;
    if (unitPrice == null) {
      unmatchedItems.push(`${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (không có đơn giá để tính giá trị)`);
      continue;
    }

    await prisma.poDeliveryEvent.create({
      data: {
        lineId: line.id,
        salesEmployeeId: line.salesEmployeeId,
        eventDate: slipDate ?? new Date(),
        quantity: item.qtyActual,
        value: item.qtyActual * unitPrice,
        sequence: 0,
        sourceShipmentSlipId: slipId,
      },
    });
    touchedLineIds.add(line.id);
    matchedCount++;
  }

  for (const lineId of touchedLineIds) {
    await recomputeLineDeliveryFields(lineId);
  }

  return { matchedCount, unmatchedItems };
}
