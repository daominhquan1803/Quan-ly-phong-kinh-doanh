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

/**
 * Ô ngày Excel -> Date (nửa đêm giờ máy chủ). Đọc file với cellDates=false nên ô ngày là SỐ (serial),
 * quy đổi bằng XLSX.SSF.parse_date_code — KHÔNG dùng cellDates:true: thư viện xlsx (0.18.5) đổi serial
 * nguyên ngày thành 23:59:30 của NGÀY HÔM TRƯỚC khi máy chủ chạy múi giờ Việt Nam, khiến mọi ngày
 * giao (và ngày PO) lùi 1 ngày — lệch doanh số theo ngày/tháng (phát hiện 21/09/2026 khi đối chiếu
 * file PO tracking 19/09 với app: 324/326 đợt giao lệch đúng 1 ngày).
 * Nếu vẫn nhận được Date (nguồn khác), cộng 12 giờ rồi lấy ngày để chịu được lệch vài giây/phút.
 */
export function excelCellToDate(v: unknown): Date | null {
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const p = XLSX.SSF.parse_date_code(v);
    return p ? new Date(p.y, p.m - 1, p.d) : null;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    const n = new Date(v.getTime() + 12 * 3600 * 1000);
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
  }
  return null;
}
function toDate(v: unknown): Date | null {
  return excelCellToDate(v);
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
  // File thật anh Quân gửi có thể có HÀNG NGHÌN sheet phụ (mỗi khách hàng 1 sheet riêng) —
  // đã xác nhận qua dữ liệu thật (1 file gặp phải có 1825 sheet). KHÔNG parse toàn bộ workbook
  // (XLSX.read mặc định dựng sẵn MỌI sheet dù chỉ dùng 1 cái) — sẽ tràn heap Node.js giữa chừng
  // (đã tái hiện được lỗi này). Giới hạn ngay từ bước đọc, chỉ dựng đúng (các) sheet cần bằng
  // option `sheets`, các sheet phụ khác không được parse.
  const wbSheetsOnly = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  const sheetName = KNOWN_SHEET_NAMES.find((n) => wbSheetsOnly.SheetNames.includes(n));
  if (!sheetName) {
    throw new PoTrackingParseError(
      `Không tìm thấy sheet dữ liệu — cần 1 trong các tên: ${KNOWN_SHEET_NAMES.join(", ")}.`
    );
  }
  const wb = XLSX.read(buffer, { type: "buffer", sheets: [sheetName] }); // KHÔNG cellDates — xem excelCellToDate
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
 * Tạo bản ghi batch TRƯỚC KHI parse/ghi dữ liệu — cho phép route upload trả về batchId ngay lập
 * tức (parse + ghi DB của file lớn có thể mất vài phút, xem importPoTrackingRows) để FE poll
 * tiến độ thay vì giữ 1 request HTTP treo lâu (từng gây 502 Bad Gateway với file thật ~25k dòng).
 */
export async function createPoTrackingImportBatch(opts: { fileName: string; createdById: string }) {
  return prisma.poTrackingImportBatch.create({
    data: { fileName: opts.fileName, totalRows: 0, createdCount: 0, updatedCount: 0, errorCount: 0, createdById: opts.createdById },
  });
}

/**
 * Ghi danh sách dòng đã parse vào DB — upsert theo naturalKey (Số PO + Mã hàng + số thứ tự xuất
 * hiện), tạo PoDeliveryEvent cho tối đa 3 đợt giao ghi trong file, giữ nguyên cờ "Kết thúc đơn"
 * bấm tay (manuallyClosed) không bị file ghi đè. Logic THUẦN Y HỆT scripts/import-po-tracking.ts
 * bản gốc — tách ra đây để route upload trong app và script CLI dùng chung 1 nguồn, tránh lệch
 * hành vi giữa 2 nơi theo thời gian. `batchId` phải đã tồn tại (xem createPoTrackingImportBatch).
 */
export async function importPoTrackingRows(rows: ParsedPoTrackingRow[], batchId: string): Promise<ImportPoTrackingResult> {
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

  // Mốc thời điểm nhập file NÀY — nền vừa ghi coi như đã bao gồm mọi đợt giao Phiếu đi hàng TRƯỚC
  // mốc này (xem getSlipAggForAllLines), nên chỉ cộng slip TỪ mốc này trở đi, và xoá luôn các đợt
  // slip cũ hơn (đã "hấp thụ" vào nền) để không bị đếm lại lần sau — tránh lặp lại bug đếm trùng
  // doanh số đã xảy ra 17/09/2026 khi nhập lại baseline đè lên dữ liệu Phiếu đi hàng đã có sẵn.
  const batch = await prisma.poTrackingImportBatch.findUniqueOrThrow({ where: { id: batchId }, select: { createdAt: true } });
  const slipAggByLine = await getSlipAggForAllLines(batch.createdAt);

  let created = 0;
  let updated = 0;
  let errorCount = 0;
  const errors: string[] = [];

  // File thật có thể có hàng chục nghìn dòng (đã gặp 23-26k dòng) — ghi tuần tự từng dòng (mỗi
  // dòng vài round-trip DB) mất nhiều phút, vượt timeout của Nginx/trình duyệt (Bad Gateway đã
  // tái hiện được với file thật). Tính sẵn naturalKey THEO ĐÚNG THỨ TỰ FILE trước (đồng bộ, không
  // phụ thuộc nhau) rồi mới ghi DB SONG SONG theo lô — an toàn vì mỗi dòng chỉ đụng đúng 1
  // PoTrackingLine của riêng nó, không đọc/ghi chéo dòng khác trong lúc ghi.
  const rowsWithKey = rows.map((r) => ({ r, naturalKey: naturalKeyOf(r) }));
  const CONCURRENCY = 20;

  async function processRow(r: ParsedPoTrackingRow, naturalKey: string): Promise<void> {
    try {
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
        importBatchId: batchId,
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
      // liệu hiện tại — KHÔNG đụng đợt giao do Phiếu đi hàng sinh ra CHƯA bị nền mới hấp thụ.
      await prisma.poDeliveryEvent.deleteMany({ where: { lineId: line.id, sourceShipmentSlipId: null } });
      // Xoá đợt giao Phiếu đi hàng ĐÃ bị nền mới hấp thụ (eventDate trước mốc nhập file này) — xem
      // giải thích ở batch.createdAt phía trên.
      await prisma.poDeliveryEvent.deleteMany({
        where: { lineId: line.id, sourceShipmentSlipId: { not: null }, eventDate: { lt: batch.createdAt } },
      });
      const slots: [ParsedPoTrackingRow["delivery1"], number][] = [
        [r.delivery1, 1],
        [r.delivery2, 2],
        [r.delivery3, 3],
      ];
      await Promise.all(
        slots
          .filter(([slot]) => slot)
          .map(([slot, seq]) =>
            prisma.poDeliveryEvent.create({
              data: { lineId: line.id, salesEmployeeId, eventDate: slot!.date, quantity: slot!.qty, value: slot!.value, sequence: seq },
            })
          )
      );
    } catch (e) {
      errorCount++;
      errors.push(`${r.poCode} / ${r.itemCode ?? r.itemName ?? "?"}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (let i = 0; i < rowsWithKey.length; i += CONCURRENCY) {
    const chunk = rowsWithKey.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(({ r, naturalKey }) => processRow(r, naturalKey)));
  }

  await prisma.poTrackingImportBatch.update({
    where: { id: batchId },
    data: {
      totalRows: rows.length,
      createdCount: created,
      updatedCount: updated,
      errorCount,
      errorReport: errors.length ? errors : undefined,
      completedAt: new Date(),
    },
  });

  return { totalRows: rows.length, createdCount: created, updatedCount: updated, errorCount, errors };
}
