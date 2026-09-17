import * as XLSX from "xlsx";
import { prisma } from "./index";
import {
  getSlipAggForAllLines,
  computeLineDeliveryFields,
  normPoStatus,
  PO_CLOSED_STATUS,
  contentIndicatesNoLongerNeeded,
} from "./po-delivery-sync";

// Chỉ 4 mã NVKD này (sau khi chuẩn hoá hoa/trim) được gán vào tài khoản hệ thống — xác nhận
// bằng đối chiếu tên khách hàng trùng khớp dữ liệu AMIS. Mã khác giữ nguyên dạng text, không
// suy đoán gán nhầm người.
const NVKD_TO_AMIS_CODE: Record<string, string> = {
  TANDT: "DANGTAN",
  QUANDM: "MINHQUAN",
  TUNGNT: "THANHTUNG",
  DUNGP: "PHAMDUNG",
};

// Tên sheet chứa dữ liệu đã đổi theo thời gian ("Sheet1" ban đầu, sau này anh Quân dùng "Nhập
// Liệu") — thử lần lượt các tên đã gặp trong thực tế, không suy đoán mù nếu không khớp cái nào.
const KNOWN_SHEET_NAMES = ["Sheet1", "Nhập Liệu"];

export interface ParsedPoTrackingRow {
  nvkdCodeRaw: string | null;
  customerCode: string | null;
  poMonthLabel: string | null;
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  invoiceName: string | null;
  customerItemCode: string | null;
  monthLabel: string | null;
  poDate: Date | null;
  poQuantity: number | null;
  unit: string | null;
  actualPrice: number | null;
  contractPrice: number | null;
  requestedDeliveryDate: Date | null;
  note: string | null;
  statusRaw: string | null;
  delivery1: { date: Date; qty: number; value: number } | null;
  delivery2: { date: Date; qty: number; value: number } | null;
  delivery3: { date: Date; qty: number; value: number } | null;
  totalDeliveredQty: number | null;
  remainingQty: number | null;
  poValue: number;
  deliveredValue: number;
  remainingValue: number;
  content: string | null;
}

function toDate(v: unknown): Date | null {
  return v instanceof Date && !isNaN(v.getTime()) ? v : null;
}
function toNum(v: unknown): number | null {
  return typeof v === "number" && !isNaN(v) ? v : null;
}
function toStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function parseDeliverySlot(dateV: unknown, qtyV: unknown, valueV: unknown) {
  const date = toDate(dateV);
  const qty = toNum(qtyV) ?? 0;
  const value = toNum(valueV) ?? 0;
  if (!date || (qty === 0 && value === 0)) return null;
  return { date, qty, value };
}

export class PoTrackingParseError extends Error {}

/**
 * Đọc file Excel "PO tracking" (định dạng cố định — xem docblock scripts/import-po-tracking.ts
 * để biết đầy đủ thứ tự cột) thành danh sách dòng đã parse. Dùng chung cho cả script CLI
 * (nhập thủ công qua SSH) lẫn route upload trong app — 1 chỗ duy nhất hiểu cấu trúc file này.
 */
export function parsePoTrackingExcel(buffer: Buffer): ParsedPoTrackingRow[] {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = KNOWN_SHEET_NAMES.find((n) => wb.Sheets[n]);
  if (!sheetName) {
    throw new PoTrackingParseError(
      `Không tìm thấy sheet dữ liệu — cần 1 trong các tên: ${KNOWN_SHEET_NAMES.join(", ")}.`
    );
  }
  const ws = wb.Sheets[sheetName];
  // Range tường minh vì !ref của file này lỡ tràn tới cột XFA (do định dạng thừa), khiến
  // sheet_to_json không giới hạn range sẽ quét cực chậm/không cần thiết.
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, range: "A1:AG50000" });

  const out: ParsedPoTrackingRow[] = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const poCode = toStr(r?.[3]);
    if (!poCode) continue;

    out.push({
      nvkdCodeRaw: toStr(r[0]),
      customerCode: toStr(r[1]),
      poMonthLabel: toStr(r[2]),
      poCode,
      itemCode: toStr(r[4]),
      itemName: toStr(r[5]),
      invoiceName: toStr(r[6]),
      customerItemCode: toStr(r[7]),
      monthLabel: toStr(r[8]),
      poDate: toDate(r[9]),
      poQuantity: toNum(r[10]),
      unit: toStr(r[11]),
      actualPrice: toNum(r[12]),
      contractPrice: toNum(r[13]),
      requestedDeliveryDate: toDate(r[14]),
      note: toStr(r[15]),
      statusRaw: toStr(r[28]),
      delivery1: parseDeliverySlot(r[17], r[18], r[19]),
      delivery2: parseDeliverySlot(r[20], r[21], r[22]),
      delivery3: parseDeliverySlot(r[23], r[24], r[25]),
      totalDeliveredQty: toNum(r[26]),
      remainingQty: toNum(r[27]),
      poValue: toNum(r[29]) ?? 0,
      deliveredValue: toNum(r[30]) ?? 0,
      remainingValue: toNum(r[31]) ?? 0,
      content: toStr(r[32]),
    });
  }
  return out;
}

export interface ImportPoTrackingResult {
  totalRows: number;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  errors: string[];
}

/**
 * Ghi danh sách dòng đã parse vào DB — upsert theo naturalKey (Số PO + Mã hàng + số thứ tự xuất
 * hiện), tạo PoDeliveryEvent cho tối đa 3 đợt giao ghi trong file, giữ nguyên cờ "Kết thúc đơn"
 * bấm tay (manuallyClosed) không bị file ghi đè. Logic THUẦN Y HỆT scripts/import-po-tracking.ts
 * bản gốc — tách ra đây để route upload trong app và script CLI dùng chung 1 nguồn, tránh lệch
 * hành vi giữa 2 nơi theo thời gian.
 */
export async function importPoTrackingRows(
  rows: ParsedPoTrackingRow[],
  opts: { fileName: string; createdById: string }
): Promise<ImportPoTrackingResult> {
  const occurrence = new Map<string, number>();
  function naturalKeyOf(r: ParsedPoTrackingRow): string {
    const itemKey = r.itemCode ?? r.itemName ?? "?";
    const base = `${r.poCode}::${itemKey}`;
    const n = (occurrence.get(base) ?? 0) + 1;
    occurrence.set(base, n);
    return `${base}::${n}`;
  }

  const knownEmployees = await prisma.user.findMany({
    where: { amisEmployeeCode: { in: Object.values(NVKD_TO_AMIS_CODE) } },
    select: { id: true, amisEmployeeCode: true },
  });
  const employeeByAmisCode = new Map(knownEmployees.map((e) => [e.amisEmployeeCode as string, e.id]));

  const existing = await prisma.poTrackingLine.findMany({ select: { id: true, naturalKey: true, manuallyClosed: true } });
  const existingByKey = new Map(existing.map((e) => [e.naturalKey, e.id]));
  const manuallyClosedById = new Map(existing.map((e) => [e.id, e.manuallyClosed]));

  const slipAggByLine = await getSlipAggForAllLines();

  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: string[] = [];

  const batch = await prisma.poTrackingImportBatch.create({
    data: { fileName: opts.fileName, totalRows: rows.length, createdCount: 0, updatedCount: 0, errorCount: 0, createdById: opts.createdById },
  });

  for (const r of rows) {
    try {
      const naturalKey = naturalKeyOf(r);
      const nvkdNorm = r.nvkdCodeRaw?.trim().toUpperCase() ?? null;
      const amisCode = nvkdNorm ? NVKD_TO_AMIS_CODE[nvkdNorm] : undefined;
      const salesEmployeeId = amisCode ? employeeByAmisCode.get(amisCode) ?? null : null;

      const existingId = existingByKey.get(naturalKey);
      const slipAgg = existingId ? slipAggByLine.get(existingId) ?? { qty: 0, value: 0 } : { qty: 0, value: 0 };
      const baselineClosed =
        normPoStatus(r.statusRaw) === PO_CLOSED_STATUS || contentIndicatesNoLongerNeeded(r.content);
      const computed = computeLineDeliveryFields(
        {
          poValue: r.poValue,
          poQuantity: r.poQuantity,
          baselineDeliveredValue: r.deliveredValue,
          baselineDeliveredQty: r.totalDeliveredQty,
          baselineClosed,
          manuallyClosed: existingId ? manuallyClosedById.get(existingId) ?? false : false,
        },
        slipAgg
      );

      const data = {
        nvkdCodeRaw: nvkdNorm,
        salesEmployeeId,
        customerCode: r.customerCode,
        poMonthLabel: r.poMonthLabel,
        poCode: r.poCode,
        itemCode: r.itemCode,
        itemName: r.itemName,
        invoiceName: r.invoiceName,
        customerItemCode: r.customerItemCode,
        monthLabel: r.monthLabel,
        poDate: r.poDate,
        poQuantity: r.poQuantity,
        unit: r.unit,
        actualPrice: r.actualPrice,
        contractPrice: r.contractPrice,
        requestedDeliveryDate: r.requestedDeliveryDate,
        note: r.note,
        poValue: r.poValue,
        content: r.content,
        importBatchId: batch.id,
        baselineDeliveredValue: r.deliveredValue,
        baselineDeliveredQty: r.totalDeliveredQty,
        baselineClosed,
        ...computed,
      };

      const line = existingId
        ? await prisma.poTrackingLine.update({ where: { id: existingId }, data })
        : await prisma.poTrackingLine.create({ data: { ...data, naturalKey } });

      if (existingId) updated++;
      else created++;

      // Mỗi lần import là 1 bản snapshot đầy đủ CỦA RIÊNG FILE NÀY cho dòng PO này — xoá hết
      // event do CHÍNH FILE PO TRACKING sinh ra (sourceShipmentSlipId = null) rồi ghi lại theo dữ
      // liệu hiện tại — KHÔNG đụng đợt giao do Phiếu đi hàng sinh ra.
      await prisma.poDeliveryEvent.deleteMany({ where: { lineId: line.id, sourceShipmentSlipId: null } });
      const slots: [ParsedPoTrackingRow["delivery1"], number][] = [
        [r.delivery1, 1],
        [r.delivery2, 2],
        [r.delivery3, 3],
      ];
      for (const [slot, seq] of slots) {
        if (!slot) continue;
        await prisma.poDeliveryEvent.create({
          data: { lineId: line.id, salesEmployeeId, eventDate: slot.date, quantity: slot.qty, value: slot.value, sequence: seq },
        });
      }
    } catch (e) {
      errorCount++;
      errors.push(`${r.poCode} / ${r.itemCode ?? r.itemName ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await prisma.poTrackingImportBatch.update({
    where: { id: batch.id },
    data: { createdCount: created, updatedCount: updated, errorCount, errorReport: errors.length ? errors : undefined },
  });

  return { totalRows: rows.length, createdCount: created, updatedCount: updated, errorCount, errors };
}
