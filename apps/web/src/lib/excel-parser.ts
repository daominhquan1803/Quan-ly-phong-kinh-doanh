import * as XLSX from "xlsx";
import { ColumnMapping, ORDER_FIELDS, OrderFieldKey } from "./column-mapper";

export interface ExcelPreview {
  sheetName: string;
  headers: string[];
  sampleRows: string[][];
  totalRows: number;
}

export interface ParsedOrderRow {
  rowNumber: number; // dòng trong Excel (tính cả header, để user dễ đối chiếu)
  orderCode: string;
  customerName: string;
  customerCode: string | null;
  salesEmployeeNameRaw: string | null;
  orderDate: Date | null;
  expectedDeliveryDate: Date | null;
  status: string | null;
  totalValue: number;
  poCode: string | null;
}

export interface ParseResult {
  rows: ParsedOrderRow[];
  errors: { rowNumber: number; message: string }[];
}

/** Tên tất cả các sheet trong file — dùng khi Excel có nhiều sheet (vd file pivot table). */
export function listSheetNames(buffer: Buffer): string[] {
  const workbook = XLSX.read(buffer, { type: "buffer", bookSheets: true });
  return workbook.SheetNames;
}

/** Đọc 1 sheet cụ thể — mặc định sheet đầu tiên nếu không chỉ định (giữ tương thích cũ). */
export function readSheet(buffer: Buffer, sheetName?: string) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const targetName = sheetName && workbook.SheetNames.includes(sheetName) ? sheetName : workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetName];
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  return { sheetName: targetName, rows };
}

/** @deprecated dùng readSheet(buffer, sheetName) — giữ lại cho code cũ chưa cập nhật. */
export function readFirstSheet(buffer: Buffer) {
  return readSheet(buffer);
}

export function previewExcel(buffer: Buffer, sheetName?: string, sampleSize = 5): ExcelPreview {
  const { sheetName: resolvedName, rows } = readSheet(buffer, sheetName);
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((h) => String(h ?? "").trim()).filter(Boolean);
  const sampleRows = dataRows
    .slice(0, sampleSize)
    .map((r) => headers.map((_, i) => String(r[i] ?? "")));

  return { sheetName: resolvedName, headers, sampleRows, totalRows: dataRows.length };
}

export function parseExcelDate(value: unknown): Date | null {
  if (!value && value !== 0) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") {
    // Excel serial date
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(parsed.y, parsed.m - 1, parsed.d);
  }
  const str = String(value).trim();
  if (!str) return null;
  // dd/mm/yyyy hoặc dd-mm-yyyy
  const m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    return new Date(Number(y), Number(mo) - 1, Number(d));
  }
  const fallback = new Date(str);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function parseNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const str = String(value ?? "")
    .replace(/[^\d.,\-]/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "") // bỏ dấu chấm ngăn cách nghìn
    .replace(",", ".");
  const n = Number(str);
  return Number.isFinite(n) ? n : 0;
}

export function parseWithMapping(buffer: Buffer, mapping: ColumnMapping): ParseResult {
  const { rows } = readFirstSheet(buffer);
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());

  const colIndex: Partial<Record<OrderFieldKey, number>> = {};
  for (const field of ORDER_FIELDS) {
    const headerName = mapping[field.key];
    if (headerName) {
      const idx = headers.indexOf(headerName);
      if (idx >= 0) colIndex[field.key] = idx;
    }
  }

  const result: ParseResult = { rows: [], errors: [] };

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2; // +1 header, +1 để đúng số dòng Excel (1-indexed)
    const get = (key: OrderFieldKey): unknown => {
      const idx = colIndex[key];
      return idx === undefined ? undefined : row[idx];
    };

    const orderCode = String(get("orderCode") ?? "").trim();
    const customerName = String(get("customerName") ?? "").trim();

    if (!orderCode && !customerName) return; // dòng trống, bỏ qua âm thầm

    if (!orderCode) {
      result.errors.push({ rowNumber, message: "Thiếu Mã đơn hàng" });
      return;
    }
    if (!customerName) {
      result.errors.push({ rowNumber, message: "Thiếu Khách hàng" });
      return;
    }

    result.rows.push({
      rowNumber,
      orderCode,
      customerName,
      customerCode: (String(get("customerCode") ?? "").trim() || null),
      salesEmployeeNameRaw: (String(get("salesEmployeeNameRaw") ?? "").trim() || null),
      orderDate: parseExcelDate(get("orderDate")),
      expectedDeliveryDate: parseExcelDate(get("expectedDeliveryDate")),
      status: (String(get("status") ?? "").trim() || null),
      totalValue: parseNumber(get("totalValue")),
      poCode: (String(get("poCode") ?? "").trim() || null),
    });
  });

  return result;
}
