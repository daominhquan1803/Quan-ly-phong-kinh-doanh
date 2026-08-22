import { prisma } from "./index";

export const PO_CLOSED_STATUS = "kết thúc";
export function normPoStatus(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Bỏ dấu tiếng Việt + hạ chữ thường — dùng để so khớp ghi chú tự do trong cột "Nội Dung"
 * không phân biệt cách gõ dấu (vd "huỷ" và "hủy" đều về "huy"). */
function stripDiacriticsVN(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();
}

/**
 * true nếu cột "Nội Dung" (ghi chú tự do, khác cột "Trạng thái") của dòng PO có nhắc đến
 * huỷ/kết thúc — dấu hiệu PO không cần giao tiếp dù cột "Trạng thái" trong file chưa kịp cập
 * nhật (theo anh Quân xác nhận: nội dung ghi huỷ/kết thúc thì cũng coi như xong). So khớp theo
 * TỪNG TỪ sau khi bỏ dấu (không phải chuỗi con), để tránh khớp nhầm các từ tình cờ chứa "huy"/
 * "ket"/"thuc" khi ghép cùng chữ khác.
 */
export function contentIndicatesNoLongerNeeded(content: string | null | undefined): boolean {
  if (!content) return false;
  const tokens = stripDiacriticsVN(content).split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.includes("huy")) return true;
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i] === "ket" && tokens[i + 1] === "thuc") return true;
  }
  return false;
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
    // Đóng thủ công qua nút "Kết thúc đơn" (xem setPoManualClosed) — có hiệu lực TƯƠNG ĐƯƠNG
    // baselineClosed (ép statusRaw = "Kết thúc" dù chưa giao đủ), nhưng khác ở chỗ chỉ đổi qua
    // nút bấm, không bị 1 lần nhập lại file PO tracking Excel ghi đè/mở lại.
    manuallyClosed: boolean;
  },
  slipAgg: SlipAgg
): LineDeliveryFields {
  const deliveredValue = line.baselineDeliveredValue + slipAgg.value;
  const totalDeliveredQty = (line.baselineDeliveredQty ?? 0) + slipAgg.qty;
  const remainingValue = Math.max(line.poValue - deliveredValue, 0);
  const remainingQty = line.poQuantity != null ? Math.max(line.poQuantity - totalDeliveredQty, 0) : null;
  const fullyDelivered = line.poQuantity != null ? totalDeliveredQty >= line.poQuantity : deliveredValue >= line.poValue;
  // Hết giá trị còn lại (remainingValue = 0) thì cũng coi là xong, KỂ CẢ khi SL PO (nếu có)
  // chưa khớp đúng số đã giao — 1 số dòng lệch SL nhỏ do làm tròn/điều chỉnh giá không còn ý
  // nghĩa về tiền, theo anh Quân xác nhận: hết giá trị chưa giao thì không cần giao tiếp nữa.
  const noRemainingValue = remainingValue === 0;
  const statusRaw =
    line.baselineClosed || line.manuallyClosed || fullyDelivered || noRemainingValue ? "Kết thúc" : "Đang thực hiện";
  return { deliveredValue, remainingValue, totalDeliveredQty, remainingQty, statusRaw };
}

/** Tính lại và ghi đè các trường tình trạng giao hàng của 1 dòng PO — dùng sau khi 1 Phiếu đi
 * hàng sinh/xoá đợt giao gắn với dòng đó, hoặc sau khi đổi cờ manuallyClosed. */
export async function recomputeLineDeliveryFields(lineId: string): Promise<void> {
  const line = await prisma.poTrackingLine.findUnique({
    where: { id: lineId },
    select: {
      id: true,
      poValue: true,
      poQuantity: true,
      baselineDeliveredValue: true,
      baselineDeliveredQty: true,
      baselineClosed: true,
      manuallyClosed: true,
    },
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
      manuallyClosed: line.manuallyClosed,
    },
    slipAgg
  );
  await prisma.poTrackingLine.update({ where: { id: lineId }, data: fields });
}

export interface SetPoManualClosedResult {
  updatedLineCount: number;
}

/**
 * Đóng/mở lại thủ công 1 PO (áp dụng cho MỌI dòng hàng cùng Số PO) — nút "Kết thúc đơn"/"Mở
 * lại đơn" ở trang Tiến độ giao hàng, dùng khi PO không cần giao tiếp dù chưa giao đủ SL/giá
 * trị. `lineWhere` dùng để giới hạn phạm vi theo quyền (vd chỉ đúng nhân viên sở hữu) — nếu
 * không có dòng nào khớp (PO không tồn tại hoặc không thuộc quyền), trả về updatedLineCount 0,
 * không update gì, để route gọi trả 404/403 phù hợp.
 */
export async function setPoManualClosed(
  poCode: string,
  closed: boolean,
  userId: string | null,
  lineWhere: Record<string, unknown> = {}
): Promise<SetPoManualClosedResult> {
  const lines = await prisma.poTrackingLine.findMany({
    where: { poCode, ...lineWhere },
    select: { id: true },
  });
  if (lines.length === 0) return { updatedLineCount: 0 };

  const lineIds = lines.map((l) => l.id);
  await prisma.poTrackingLine.updateMany({
    where: { id: { in: lineIds } },
    data: {
      manuallyClosed: closed,
      manuallyClosedAt: closed ? new Date() : null,
      manuallyClosedByUserId: closed ? userId : null,
    },
  });
  for (const lineId of lineIds) {
    await recomputeLineDeliveryFields(lineId);
  }
  return { updatedLineCount: lineIds.length };
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
    // Trước đây 2 trường hợp này bị BỎ QUA ÂM THẦM (không ghi vào unmatchedItems) — người
    // upload không thấy cảnh báo gì dù toàn bộ dòng hàng không được ghi nhận, chỉ phát hiện ra
    // khi thấy số liệu giao hàng không đổi. Nay báo rõ lý do để biết ngay cần map lại cột nào.
    if (!item.poSaleNumber) {
      unmatchedItems.push(`${item.itemCode ?? item.itemName} (thiếu Số PO — kiểm tra lại cột đã map)`);
      continue;
    }
    if (!item.qtyActual || item.qtyActual <= 0) {
      unmatchedItems.push(`${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (thiếu SL thực xuất — kiểm tra lại cột đã map)`);
      continue;
    }

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

export interface ResyncAllShipmentSlipsResult {
  totalSlips: number;
  totalMatched: number;
  totalUnmatchedItems: number;
  unmatchedSamples: string[];
}

/**
 * Nút "Đồng bộ lại giao hàng" ở trang Phiếu đi hàng — chạy lại applyShipmentSlipDeliveries cho
 * TOÀN BỘ phiếu đã có trong DB, dùng khi anh nghi ngờ số liệu giao hàng chưa cập nhật đúng sau
 * khi upload (vd dòng PO tương ứng được nhập/sửa SAU khi phiếu đã upload, hoặc phiếu trước đó
 * chưa khớp được do thiếu dữ liệu Số PO/SL thực xuất mà nay đã bổ sung). An toàn để chạy lặp
 * lại nhiều lần — mỗi phiếu chỉ xoá+tạo lại đúng phần đợt giao CỦA CHÍNH NÓ (sourceShipmentSlipId
 * = slip.id), không đụng đợt giao của phiếu khác hay của file PO tracking Excel.
 */
export async function resyncAllShipmentSlipDeliveries(): Promise<ResyncAllShipmentSlipsResult> {
  const slips = await prisma.shipmentSlip.findMany({
    select: {
      id: true,
      slipDate: true,
      items: { select: { itemCode: true, itemName: true, poSaleNumber: true, qtyActual: true } },
    },
  });

  let totalMatched = 0;
  let totalUnmatchedItems = 0;
  const unmatchedSamples: string[] = [];

  for (const slip of slips) {
    const items: ShipmentSlipDeliveryItem[] = slip.items.map((i) => ({
      itemCode: i.itemCode,
      itemName: i.itemName,
      poSaleNumber: i.poSaleNumber,
      qtyActual: i.qtyActual != null ? Number(i.qtyActual) : null,
    }));
    const result = await applyShipmentSlipDeliveries(slip.id, slip.slipDate, items);
    totalMatched += result.matchedCount;
    totalUnmatchedItems += result.unmatchedItems.length;
    for (const u of result.unmatchedItems) {
      if (unmatchedSamples.length < 50) unmatchedSamples.push(u);
    }
  }

  return { totalSlips: slips.length, totalMatched, totalUnmatchedItems, unmatchedSamples };
}
