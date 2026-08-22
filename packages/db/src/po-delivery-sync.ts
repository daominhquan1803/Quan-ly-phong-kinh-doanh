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

/** Số thứ tự xuất hiện của 1 dòng PO trong file PO tracking gốc — hậu tố cuối naturalKey (vd
 * "D01.26MQ11A::AA09180::2" → 2). Dùng để sắp xếp đúng thứ tự khi 1 PO có nhiều dòng cùng Mã
 * hàng, phân bổ SL giao trừ dần lần lượt theo đúng thứ tự này (không phải thứ tự DB trả về). */
function parseOccurrenceIndex(naturalKey: string): number {
  const n = Number(naturalKey.slice(naturalKey.lastIndexOf("::") + 2));
  return Number.isFinite(n) ? n : 0;
}

export interface AllocationCandidate {
  lineId: string;
  // SL còn có thể nhận thêm của dòng này TẠI THỜI ĐIỂM phân bổ (đã trừ phần đã giao qua nền +
  // các phiếu khác + phần đã phân bổ trong CHÍNH lần chạy này cho dòng đó).
  capacity: number;
}

export interface QtyAllocation {
  lineId: string;
  qty: number;
}

/**
 * Phân bổ 1 SL thực xuất vào NHIỀU dòng PO trùng Mã hàng trong cùng 1 PO (do file PO tracking
 * gốc tách nhiều dòng cùng mã, vd đặt 2 đợt giá khác nhau) — trừ dần LẦN LƯỢT theo đúng thứ tự
 * candidates truyền vào (gọi hàm này với candidates đã sắp xếp theo parseOccurrenceIndex): dòng
 * đầu nhận đủ phần còn thiếu của nó trước, dư ra mới sang dòng tiếp theo. Nếu tổng SL giao VƯỢT
 * quá tổng SL còn lại của mọi dòng (giao dư/PO đã điều chỉnh), phần dư dồn hết vào DÒNG CUỐI
 * CÙNG — không làm mất số liệu, giống cách 1 dòng đơn lẻ vẫn cho phép giao vượt SL PO.
 */
export function allocateQtyAcrossLines(qty: number, candidates: AllocationCandidate[]): QtyAllocation[] {
  const results: QtyAllocation[] = [];
  let remaining = qty;
  for (let i = 0; i < candidates.length; i++) {
    const isLast = i === candidates.length - 1;
    const c = candidates[i];
    const take = isLast ? remaining : Math.min(remaining, Math.max(0, c.capacity));
    if (take > 0) results.push({ lineId: c.lineId, qty: take });
    remaining -= take;
    if (remaining <= 0 && !isLast) break;
  }
  return results;
}

/** Bỏ hậu tố ".N" (số phiên bản, vd "SB00286.1" → "SB00286") khỏi mã hàng — 1 số nguồn dữ liệu
 * (Phiếu đi hàng, đơn AMIS) ghi mã hàng kèm hậu tố phiên bản mà nguồn khác (file PO tracking
 * Excel cũ) không có, dù cùng chỉ 1 sản phẩm. Dùng chung cho cả khớp Phiếu đi hàng
 * (findCandidateLines) lẫn đồng bộ PO từ AMIS (po-tracking-from-orders.ts). */
export function stripItemCodeVersionSuffix(itemCode: string): string {
  return itemCode.replace(/\.\d+$/, "");
}

const CANDIDATE_LINE_SELECT = {
  id: true,
  naturalKey: true,
  contractPrice: true,
  poValue: true,
  poQuantity: true,
  salesEmployeeId: true,
  baselineDeliveredQty: true,
} as const;

/**
 * Tìm dòng PO khớp 1 dòng hàng của Phiếu đi hàng — thử lần lượt nhiều cách trước khi báo
 * "không tìm thấy" (không suy đoán mờ, chỉ thử các cách khớp CHÍNH XÁC):
 * 1) Theo đúng Mã hàng (nếu có).
 * 2) Không khớp Mã hàng (hoặc thiếu Mã hàng) → thử theo đúng Tên hàng.
 * 3) Mã hàng có hậu tố ".N" (số phiên bản, vd "SB00286.1") mà cách 1/2 vẫn không ra kết quả —
 *    thử lại với mã đã BỎ hậu tố (vd "SB00286") — 1 số nguồn xuất (Phiếu đi hàng) thêm hậu tố
 *    phiên bản mà file PO tracking gốc không có. Chỉ thử khi mã thật sự có hậu tố (khác mã gốc).
 */
async function findCandidateLines(poCode: string, itemCode: string | null, itemName: string) {
  if (itemCode) {
    const byCode = await prisma.poTrackingLine.findMany({ where: { poCode, itemCode }, select: CANDIDATE_LINE_SELECT });
    if (byCode.length > 0) return byCode;
  }
  const byName = await prisma.poTrackingLine.findMany({ where: { poCode, itemName }, select: CANDIDATE_LINE_SELECT });
  if (byName.length > 0) return byName;
  if (itemCode) {
    const stripped = stripItemCodeVersionSuffix(itemCode);
    if (stripped !== itemCode) {
      const byStrippedCode = await prisma.poTrackingLine.findMany({
        where: { poCode, itemCode: stripped },
        select: CANDIDATE_LINE_SELECT,
      });
      if (byStrippedCode.length > 0) return byStrippedCode;
    }
  }
  return [] as Awaited<ReturnType<typeof prisma.poTrackingLine.findMany<{ where: { poCode: string }; select: typeof CANDIDATE_LINE_SELECT }>>>;
}

/**
 * Đồng bộ đợt giao từ 1 Phiếu đi hàng vào các dòng PO tracking tương ứng — khớp theo Số PO
 * (poSaleNumber = PoTrackingLine.poCode) + Mã hàng (hoặc Tên hàng nếu thiếu mã, xem
 * findCandidateLines để biết đầy đủ thứ tự thử khớp). Nếu khớp đúng
 * 1 dòng thì ghi thẳng; nếu khớp NHIỀU dòng cùng Mã hàng (PO tách nhiều dòng cùng mã) thì phân
 * bổ SL trừ dần lần lượt theo đúng thứ tự trong file gốc (xem allocateQtyAcrossLines) — chỉ áp
 * dụng khi MỌI dòng khớp đều có SL PO (mới tính được "còn nhận được bao nhiêu"), nếu không thì
 * không suy đoán, báo mơ hồ như cũ. Giá trị giao = SL × đơn giá CỦA ĐÚNG DÒNG nhận phần đó (Giá
 * HĐ, hoặc suy ra G.Trị PO / SL PO nếu thiếu Giá HĐ) — bỏ qua dòng nào không có cách tính đơn giá.
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
  // SL đã phân bổ cho từng dòng TRONG CHÍNH LẦN CHẠY NÀY — trừ tiếp vào capacity của các dòng
  // hàng khác trong cùng phiếu nếu chúng cũng rơi vào cùng nhóm nhiều-dòng-cùng-mã.
  const allocatedThisRun = new Map<string, number>();

  async function createEvent(
    line: { id: string; contractPrice: number | null; poValue: number; poQuantity: number | null; salesEmployeeId: string | null },
    qty: number
  ): Promise<boolean> {
    const unitPrice =
      line.contractPrice != null
        ? line.contractPrice
        : line.poQuantity != null && line.poQuantity > 0
        ? line.poValue / line.poQuantity
        : null;
    if (unitPrice == null) return false;
    await prisma.poDeliveryEvent.create({
      data: {
        lineId: line.id,
        salesEmployeeId: line.salesEmployeeId,
        eventDate: slipDate ?? new Date(),
        quantity: qty,
        value: qty * unitPrice,
        sequence: 0,
        sourceShipmentSlipId: slipId,
      },
    });
    touchedLineIds.add(line.id);
    allocatedThisRun.set(line.id, (allocatedThisRun.get(line.id) ?? 0) + qty);
    return true;
  }

  for (const item of items) {
    // 2 trường hợp dưới đây trước đây bị BỎ QUA ÂM THẦM (không ghi vào unmatchedItems) — người
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

    const candidates = await findCandidateLines(item.poSaleNumber, item.itemCode, item.itemName);

    if (candidates.length === 0) {
      unmatchedItems.push(`${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (không tìm thấy dòng PO khớp)`);
      continue;
    }

    if (candidates.length === 1) {
      const line = candidates[0];
      const ok = await createEvent(
        { id: line.id, contractPrice: line.contractPrice != null ? Number(line.contractPrice) : null, poValue: Number(line.poValue), poQuantity: line.poQuantity != null ? Number(line.poQuantity) : null, salesEmployeeId: line.salesEmployeeId },
        item.qtyActual
      );
      if (!ok) {
        unmatchedItems.push(`${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (không có đơn giá để tính giá trị)`);
        continue;
      }
      matchedCount++;
      continue;
    }

    // Nhiều dòng cùng Mã hàng trong 1 PO — trừ dần lần lượt theo đúng thứ tự xuất hiện trong
    // file PO tracking gốc. Chỉ tự trừ dần được khi MỌI dòng khớp đều có SL PO.
    if (candidates.some((c) => c.poQuantity == null)) {
      unmatchedItems.push(
        `${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (khớp nhiều dòng nhưng thiếu SL PO ở ít nhất 1 dòng, không tự trừ dần được)`
      );
      continue;
    }

    const sorted = [...candidates].sort((a, b) => parseOccurrenceIndex(a.naturalKey) - parseOccurrenceIndex(b.naturalKey));
    const allocCandidates: AllocationCandidate[] = [];
    for (const c of sorted) {
      const otherSlipAgg = await getSlipAggForLine(c.id); // đã loại trừ chính phiếu này (event của nó đã bị xoá ở trên)
      const used = Number(c.baselineDeliveredQty ?? 0) + otherSlipAgg.qty + (allocatedThisRun.get(c.id) ?? 0);
      allocCandidates.push({ lineId: c.id, capacity: Number(c.poQuantity) - used });
    }

    const allocations = allocateQtyAcrossLines(item.qtyActual, allocCandidates);
    let anyAllocated = false;
    let anyPriceMissing = false;
    for (const alloc of allocations) {
      const line = sorted.find((c) => c.id === alloc.lineId)!;
      const ok = await createEvent(
        { id: line.id, contractPrice: line.contractPrice != null ? Number(line.contractPrice) : null, poValue: Number(line.poValue), poQuantity: Number(line.poQuantity), salesEmployeeId: line.salesEmployeeId },
        alloc.qty
      );
      if (ok) anyAllocated = true;
      else anyPriceMissing = true;
    }
    if (anyAllocated) matchedCount++;
    if (anyPriceMissing) {
      unmatchedItems.push(`${item.poSaleNumber} / ${item.itemCode ?? item.itemName} (1 phần không có đơn giá để tính giá trị)`);
    }
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
