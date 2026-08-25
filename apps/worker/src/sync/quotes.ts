import * as XLSX from "xlsx";
import { prisma, normalizeVN, classifyQuoteStatusByColor, QuoteStatus } from "@hoanggia/db";
import { logger } from "../logger";

export interface SyncOutcome {
  status: "SUCCESS" | "FAILED";
  recordsSynced: number;
  message?: string;
}

/**
 * Đồng bộ Báo giá từ Google Sheet dùng chung của phòng — file KHÔNG có API chính thức, chỉ dựa
 * vào việc sheet đang bật chia sẻ "Bất kỳ ai có link đều xem được" nên tải được trực tiếp qua
 * link export công khai của Google (không cần đăng nhập/OAuth). Nếu anh tắt chia sẻ công khai,
 * đồng bộ sẽ lỗi — cần bật lại chế độ chia sẻ xem được.
 */
const GOOGLE_SHEETS_QUOTE_ID = process.env.GOOGLE_SHEETS_QUOTE_ID;

// Chỉ lấy các sheet đặt tên đúng dạng "THÁNG <số>" (không phân biệt hoa/thường, khoảng trắng
// thừa đầu/cuối tên sheet — đã thấy thực tế có sheet tên " THÁNG 7" thừa dấu cách đầu) — các
// sheet khác trong file (BÁO GIÁ PKD1/2/3, Trang tính3...) không được đồng bộ theo yêu cầu.
const MONTH_SHEET_PATTERN = /^\s*th[aá]ng\s+(\d{1,2})\s*$/i;

interface ColumnMap {
  assignee?: number;
  customerField?: number;
  customerType?: number;
  customerName?: number;
  productInterest?: number;
  companyNationality?: number;
  scale?: number;
  quantity?: number;
  unit?: number;
  potentialItems?: number;
  deliveryAddress?: number;
  pricingStaff?: number;
  quoteL1?: number;
  feedbackL1?: number;
  quoteL2?: number;
  feedbackL2?: number;
  note?: number;
}

// Tên cột (đã chuẩn hoá bỏ dấu/hạ chữ thường qua normalizeVN) khớp đúng tiêu đề thật trong file
// nguồn — cột "Ngày"/"Tháng" luôn cố định ở vị trí 0/1 nên không cần dò theo tên (tiêu đề cột 0
// từng thấy bị gõ nhầm thành "Li" ở 1 sheet).
const COLUMN_HEADER_ALIASES: Record<keyof ColumnMap, string[]> = {
  assignee: ["phu trach"],
  customerField: ["linh vuc hoat dong cua kh"],
  customerType: ["phan loai kh"],
  customerName: ["ten khach hang"],
  productInterest: ["mat hang kh quan tam"],
  companyNationality: ["quoc tich dn"],
  scale: ["quy mo"],
  quantity: ["san luong"],
  unit: ["don vi"],
  potentialItems: ["mat hang tiem nang phat trien them"],
  deliveryAddress: ["dia chi giao hang"],
  pricingStaff: ["nhan vien bao gia"],
  quoteL1: ["bao gia pkh l1"],
  feedbackL1: ["phan hoi pkd l1"],
  quoteL2: ["bao gia pkh l2"],
  feedbackL2: ["phan hoi pkd l2"],
  note: ["ghi chu"],
};

/** Tìm dòng tiêu đề trong 12 dòng đầu — dò theo cột "Phụ trách" (ổn định nhất, luôn xuất hiện
 * đúng nguyên văn ở cả 3 sheet, khác "Ngày" có sheet gõ nhầm thành "Li"). File có sheet còn chèn
 * thêm 1 khối chú thích màu phía trên tiêu đề thật (xem THÁNG 7) nên không thể giả định cố định
 * ở dòng đầu. */
function findHeaderRow(rows: unknown[][]): number {
  for (let r = 0; r < Math.min(12, rows.length); r++) {
    const row = rows[r] ?? [];
    if (row.some((cell) => normalizeVN(String(cell ?? "")) === "phu trach")) return r;
  }
  return -1;
}

function buildColumnMap(headerRow: unknown[]): ColumnMap {
  const map: ColumnMap = {};
  const normalized = headerRow.map((h) => normalizeVN(String(h ?? "")));
  for (const [field, aliases] of Object.entries(COLUMN_HEADER_ALIASES) as [keyof ColumnMap, string[]][]) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map[field] = idx;
  }
  return map;
}

function cellText(row: unknown[], col: number | undefined): string | null {
  if (col === undefined) return null;
  const v = row[col];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

/** Mã màu nền (hex, không có "#") của 1 ô — dùng cột "Ngày" (vị trí 0) làm đại diện cho cả dòng,
 * vì quan sát thực tế người nhập tô nguyên cả dòng cùng 1 màu, hiếm khi tô lẻ từng ô. */
function rowColorHex(ws: XLSX.WorkSheet, rowIndex: number): string | null {
  const addr = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
  const cell = ws[addr];
  const fg = cell?.s?.fgColor;
  if (fg?.rgb && typeof fg.rgb === "string") return fg.rgb.replace(/^#/, "").slice(-6);
  return null;
}

interface ParsedQuoteRow {
  requestDay: number | null;
  assigneeRaw: string | null;
  customerField: string | null;
  customerType: string | null;
  customerName: string;
  productInterest: string | null;
  companyNationality: string | null;
  scale: string | null;
  quantity: string | null;
  unit: string | null;
  potentialItems: string | null;
  deliveryAddress: string | null;
  pricingStaff: string | null;
  quoteL1: string | null;
  feedbackL1: string | null;
  quoteL2: string | null;
  feedbackL2: string | null;
  note: string | null;
  status: QuoteStatus;
  sourceColorHex: string | null;
  sourceRowNumber: number;
}

function parseMonthSheet(ws: XLSX.WorkSheet): ParsedQuoteRow[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
  const headerRowIdx = findHeaderRow(rows);
  if (headerRowIdx < 0) return [];

  const colMap = buildColumnMap(rows[headerRowIdx]);
  const result: ParsedQuoteRow[] = [];

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const customerName = cellText(row, colMap.customerName);
    // Bỏ qua dòng trống, và dòng "rác" do lỗi format (giá trị đúng bằng chính tên tiêu đề cột —
    // đã thấy thật trong file, dòng bị tô màu lẫn vào giữa dữ liệu do copy nhầm).
    if (!customerName || normalizeVN(customerName) === "ten khach hang") continue;

    const dayRaw = cellText(row, 0);
    const requestDay = dayRaw ? Number(dayRaw) : null;
    const colorHex = rowColorHex(ws, r);

    result.push({
      requestDay: requestDay != null && Number.isFinite(requestDay) ? requestDay : null,
      assigneeRaw: cellText(row, colMap.assignee),
      customerField: cellText(row, colMap.customerField),
      customerType: cellText(row, colMap.customerType),
      customerName,
      productInterest: cellText(row, colMap.productInterest),
      companyNationality: cellText(row, colMap.companyNationality),
      scale: cellText(row, colMap.scale),
      quantity: cellText(row, colMap.quantity),
      unit: cellText(row, colMap.unit),
      potentialItems: cellText(row, colMap.potentialItems),
      deliveryAddress: cellText(row, colMap.deliveryAddress),
      pricingStaff: cellText(row, colMap.pricingStaff),
      quoteL1: cellText(row, colMap.quoteL1),
      feedbackL1: cellText(row, colMap.feedbackL1),
      quoteL2: cellText(row, colMap.quoteL2),
      feedbackL2: cellText(row, colMap.feedbackL2),
      note: cellText(row, colMap.note),
      status: classifyQuoteStatusByColor(colorHex),
      sourceColorHex: colorHex,
      sourceRowNumber: r + 1,
    });
  }

  return result;
}

export async function runQuoteSync(triggeredBy: string): Promise<SyncOutcome> {
  const syncLog = await prisma.syncLog.create({ data: { jobType: "QUOTE_SYNC", status: "RUNNING", triggeredBy } });

  try {
    if (!GOOGLE_SHEETS_QUOTE_ID) {
      throw new Error("Thiếu GOOGLE_SHEETS_QUOTE_ID trong biến môi trường của worker");
    }

    const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEETS_QUOTE_ID}/export?format=xlsx`;
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) {
      throw new Error(
        `Không tải được Google Sheet (HTTP ${res.status}) — kiểm tra lại sheet có đang bật chia sẻ "Bất kỳ ai có link đều xem được" không.`
      );
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer", cellStyles: true, cellDates: true });

    const year = new Date().getFullYear();
    let totalRows = 0;
    const sheetSummaries: string[] = [];

    for (const sheetName of wb.SheetNames) {
      const match = sheetName.match(MONTH_SHEET_PATTERN);
      if (!match) continue;
      const month = Number(match[1]);
      if (!Number.isFinite(month) || month < 1 || month > 12) continue;

      const ws = wb.Sheets[sheetName];
      const rows = parseMonthSheet(ws);

      // Xoá hết dữ liệu CŨ của đúng sheet này rồi ghi lại toàn bộ từ đầu — sheet gốc không có
      // cột ID/khoá ổn định để upsert an toàn từng dòng (người dùng có thể chèn/xoá dòng giữa
      // chừng), cùng cách làm với import Kế hoạch kinh doanh chi tiết (SalesPlanLine).
      await prisma.$transaction([
        prisma.quoteRequest.deleteMany({ where: { sourceSheetName: sheetName } }),
        prisma.quoteRequest.createMany({
          data: rows.map((r) => ({ ...r, year, month, sourceSheetName: sheetName })),
        }),
      ]);

      totalRows += rows.length;
      sheetSummaries.push(`${sheetName.trim()}: ${rows.length} dòng`);
    }

    const message = `Đã đồng bộ ${totalRows} dòng báo giá từ ${sheetSummaries.length} sheet tháng (${sheetSummaries.join(", ")}).`;
    logger.info(message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: "SUCCESS", finishedAt: new Date(), recordsSynced: totalRows, message },
    });
    return { status: "SUCCESS", recordsSynced: totalRows, message };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lỗi không xác định";
    logger.error("Đồng bộ Báo giá thất bại:", message);
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: { status: "FAILED", finishedAt: new Date(), message },
    });
    return { status: "FAILED", recordsSynced: 0, message };
  }
}
