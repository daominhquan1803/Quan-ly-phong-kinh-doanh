import { readSheet, parseExcelDate, parseNumber } from "./excel-parser";
import { normalizeCustomerCode } from "./debt-customer-match";

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
 * File "Bảng kê hoá đơn đã sử dụng" xuất từ AMIS — có 3 dòng tiêu đề/tên tháng ở đầu sheet trước
 * khi tới dòng tiêu đề cột thật (khác hẳn cấu trúc file Công nợ gốc), nên phải tự dò dòng tiêu đề
 * (có ô "Số hóa đơn") thay vì giả định luôn ở dòng đầu.
 */
export function parseDebtNewInvoicesExcel(
  buffer: Buffer
): { rows: ParsedNewInvoiceRow[]; errors: { rowNumber: number; message: string }[]; skippedReplaced: number } {
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

  const result: { rows: ParsedNewInvoiceRow[]; errors: { rowNumber: number; message: string }[]; skippedReplaced: number } = {
    rows: [],
    errors: [],
    skippedReplaced: 0,
  };

  for (let i = headerRowIdx + 1; i < allRows.length; i++) {
    const row = allRows[i];
    const rowNumber = i + 1; // 1-indexed Excel row
    const invoiceNumber = String(row[idx.invoiceNumber] ?? "").trim();
    const customerCodeRaw = String(row[idx.customerCode] ?? "").trim();
    if (!invoiceNumber && !customerCodeRaw) continue; // dòng trống, bỏ qua âm thầm

    const statusRaw = idx.status >= 0 ? String(row[idx.status] ?? "").trim() : "";
    if (/thay th/i.test(statusRaw)) {
      // "Hóa đơn đã bị thay thế" — hoá đơn cũ đã bị hoá đơn khác thay thế, không tính vào công nợ.
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
    if (!originalAmount) {
      result.errors.push({ rowNumber, message: "Thiếu hoặc sai Tổng tiền quy đổi" });
      continue;
    }

    result.rows.push({
      rowNumber,
      customerCodeRaw,
      customerCode: normalizeCustomerCode(customerCodeRaw),
      customerName: idx.customerName >= 0 ? String(row[idx.customerName] ?? "").trim() : "",
      invoiceNumber,
      invoiceDate: idx.invoiceDate >= 0 ? parseExcelDate(row[idx.invoiceDate]) : null,
      originalAmount,
      amisEmployeeCode: idx.employeeCode >= 0 ? String(row[idx.employeeCode] ?? "").trim() || null : null,
      invoiceStatusRaw: statusRaw,
    });
  }

  return result;
}
