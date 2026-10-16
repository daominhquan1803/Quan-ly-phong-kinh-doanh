import { readSheet, parseExcelDate, parseNumber } from "./excel-parser";
import { normalizeCustomerCode, isNonPkd1Customer } from "./debt-customer-match";

export type InvoiceKind = "NORMAL" | "REPLACEMENT" | "ADJUSTMENT" | "SUPERSEDED" | "ADJUSTED_ORIGINAL";

export interface ParsedNewInvoiceRow {
  rowNumber: number;
  customerCodeRaw: string;
  customerCode: string;
  customerName: string;
  invoiceNumber: string;
  invoiceDate: Date | null;
  originalAmount: number;
  amisEmployeeCode: string | null;
  invoiceStatusRaw: string;
  kind: InvoiceKind;
  /** Số hoá đơn cũ mà hoá đơn này thay thế / điều chỉnh (cùng khách) — các hoá đơn đó sẽ bị XOÁ khỏi công nợ. */
  replaces: string[];
}

/** Hoá đơn cần xoá khỏi công nợ vì đã bị thay thế / điều chỉnh. replacedBy = số hoá đơn thay thế (nếu biết). */
export interface InvoiceRemoval {
  customerCode: string;
  invoiceNumber: string;
  reason: "REPLACED" | "ADJUSTED";
  replacedBy: string | null;
}

const HEADERS = {
  invoiceNumber: "Số hóa đơn",
  invoiceDate: "Ngày hóa đơn",
  customerName: "Tên khách hàng",
  totalAmount: "Tổng tiền quy đổi",
  status: "Trạng thái hóa đơn",
  employeeCode: "Mã nhân viên",
  customerCode: "Mã khách hàng",
} as const;

export class DebtNewInvoicesParseError extends Error {}

/**
 * Phân loại "Trạng thái hóa đơn" của AMIS (anh Quân chốt 16/10/2026: có hoá đơn thay thế / điều chỉnh thì
 * hoá đơn gốc bị XOÁ khỏi công nợ):
 *  - "Hóa đơn đã bị thay thế bởi hóa đơn số N"          -> SUPERSEDED: bản cũ, bỏ.
 *  - "Hóa đơn đã bị điều chỉnh [bởi hóa đơn số N, ...]" -> ADJUSTED_ORIGINAL: bản gốc, bỏ.
 *  - "Hoá đơn thay thế cho hóa đơn số N"                -> REPLACEMENT: hoá đơn mới ĐÚNG, nhập; xoá hoá đơn N.
 *  - "Hoá đơn điều chỉnh [cho hóa đơn số N]"            -> ADJUSTMENT: nhập nếu số tiền dương; xoá hoá đơn gốc N.
 * Trước đây mọi dòng có chữ "thay thế" đều bị bỏ -> mất cả hoá đơn thay thế đúng, tiền về khách trả theo số
 * hoá đơn mới không khớp được.
 */
export function classifyInvoiceStatus(statusRaw: string): { kind: InvoiceKind; refs: string[] } {
  const s = statusRaw.normalize("NFC");
  const refs = (s.match(/\d{4,8}/g) ?? []).map((n) => n.padStart(8, "0"));
  if (/đã bị thay thế/i.test(s)) return { kind: "SUPERSEDED", refs };
  if (/bị điều chỉnh/i.test(s)) return { kind: "ADJUSTED_ORIGINAL", refs };
  if (/thay thế cho/i.test(s)) return { kind: "REPLACEMENT", refs };
  if (/điều chỉnh/i.test(s)) return { kind: "ADJUSTMENT", refs };
  return { kind: "NORMAL", refs: [] };
}

export interface ParseNewInvoicesResult {
  rows: ParsedNewInvoiceRow[];
  errors: { rowNumber: number; message: string }[];
  /** Số dòng bản cũ/bản gốc bị bỏ (SUPERSEDED + ADJUSTED_ORIGINAL). */
  skippedReplaced: number;
  removals: InvoiceRemoval[];
  skippedNonPkd1: number;
  /** Hoá đơn điều chỉnh số tiền 0 hoặc âm — không phải công nợ, không nhập (hoá đơn gốc vẫn bị xoá). */
  skippedNonPositiveAdjustment: number;
}

/**
 * File "Bảng kê hoá đơn đã sử dụng" xuất từ AMIS — có 3 dòng tiêu đề/tên tháng ở đầu sheet trước
 * khi tới dòng tiêu đề cột thật (khác hẳn cấu trúc file Công nợ gốc), nên phải tự dò dòng tiêu đề
 * (có ô "Số hóa đơn") thay vì giả định luôn ở dòng đầu.
 */
export function parseDebtNewInvoicesExcel(buffer: Buffer): ParseNewInvoicesResult {
  const { rows: allRows } = readSheet(buffer);

  const headerRowIdx = allRows.findIndex((r) => r.some((cell) => String(cell ?? "").trim() === HEADERS.invoiceNumber));
  if (headerRowIdx === -1) {
    throw new DebtNewInvoicesParseError(`Không tìm thấy dòng tiêu đề (cần có cột "${HEADERS.invoiceNumber}").`);
  }
  const headers = allRows[headerRowIdx].map((h) => String(h ?? "").trim());
  const colOf = (label: string): number => headers.indexOf(label);
  const idx = {
    invoiceNumber: colOf(HEADERS.invoiceNumber),
    invoiceDate: colOf(HEADERS.invoiceDate),
    customerName: colOf(HEADERS.customerName),
    totalAmount: colOf(HEADERS.totalAmount),
    status: colOf(HEADERS.status),
    employeeCode: colOf(HEADERS.employeeCode),
    customerCode: colOf(HEADERS.customerCode),
  };
  if (idx.invoiceNumber === -1 || idx.totalAmount === -1 || idx.customerCode === -1) {
    throw new DebtNewInvoicesParseError(
      `File thiếu cột bắt buộc — cần có "${HEADERS.invoiceNumber}", "${HEADERS.totalAmount}", "${HEADERS.customerCode}".`
    );
  }

  const result: ParseNewInvoicesResult = { rows: [], errors: [], skippedReplaced: 0, removals: [], skippedNonPkd1: 0, skippedNonPositiveAdjustment: 0 };

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const rowNumber = i + 1; // 1-indexed Excel row
    const invoiceNumber = String(row[idx.invoiceNumber] ?? "").trim();
    const customerCodeRaw = String(row[idx.customerCode] ?? "").trim();
    if (!invoiceNumber && !customerCodeRaw) continue; // dòng trống, bỏ qua âm thầm

    if (customerCodeRaw && isNonPkd1Customer(customerCodeRaw)) {
      result.skippedNonPkd1++;
      continue;
    }

    const statusRaw = idx.status >= 0 ? String(row[idx.status] ?? "").trim() : "";
    const { kind, refs } = classifyInvoiceStatus(statusRaw);
    const customerCode = normalizeCustomerCode(customerCodeRaw);

    if (kind === "SUPERSEDED" || kind === "ADJUSTED_ORIGINAL") {
      // Bản cũ/bản gốc: không nhập; nếu đã lỡ nhập từ trước thì xoá.
      if (invoiceNumber && customerCode) {
        result.removals.push({
          customerCode,
          invoiceNumber,
          reason: kind === "SUPERSEDED" ? "REPLACED" : "ADJUSTED",
          replacedBy: refs.length === 1 && refs[0] !== invoiceNumber ? refs[0] : null,
        });
      }
      result.skippedReplaced++;
      continue;
    }

    if (!invoiceNumber) {
      result.errors.push({ rowNumber, message: "Thiếu Số hóa đơn" });
      continue;
    }
    if (!customerCodeRaw) {
      result.errors.push({ rowNumber, message: "Thiếu Mã khách hàng" });
      continue;
    }
    const originalAmount = parseNumber(row[idx.totalAmount]);

    const replaces = (kind === "REPLACEMENT" || kind === "ADJUSTMENT" ? refs : []).filter((n) => n !== invoiceNumber);
    const removalReason = kind === "REPLACEMENT" ? "REPLACED" : "ADJUSTED";

    if (kind === "ADJUSTMENT" && !(originalAmount > 0)) {
      // Điều chỉnh giảm/0 đồng: không phải khoản phải thu. Hoá đơn gốc vẫn xoá theo quy tắc.
      for (const n of replaces) result.removals.push({ customerCode, invoiceNumber: n, reason: removalReason, replacedBy: null });
      result.skippedNonPositiveAdjustment++;
      continue;
    }
    if (!originalAmount) {
      result.errors.push({ rowNumber, message: "Thiếu hoặc sai Tổng tiền quy đổi" });
      continue;
    }

    for (const n of replaces) result.removals.push({ customerCode, invoiceNumber: n, reason: removalReason, replacedBy: invoiceNumber });
    result.rows.push({
      rowNumber,
      customerCodeRaw,
      customerCode,
      customerName: idx.customerName >= 0 ? String(row[idx.customerName] ?? "").trim() : "",
      invoiceNumber,
      invoiceDate: idx.invoiceDate >= 0 ? parseExcelDate(row[idx.invoiceDate]) : null,
      originalAmount,
      amisEmployeeCode: idx.employeeCode >= 0 ? String(row[idx.employeeCode] ?? "").trim() || null : null,
      invoiceStatusRaw: statusRaw,
      kind,
      replaces,
    });
  }

  return result;
}
