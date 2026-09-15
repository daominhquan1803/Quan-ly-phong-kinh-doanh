import { readSheet, parseExcelDate, parseNumber } from "./excel-parser";
import { normalizeCustomerCode } from "./debt-customer-match";
import { normalizeVN } from "@hoanggia/db";

export interface ParsedPaymentRow {
  rowNumber: number;
  paymentDate: Date | null;
  customerCodeRaw: string | null;
  customerCode: string | null;
  customerName: string | null;
  rawDescription: string | null;
  amount: number;
  note: string | null;
  // Số hoá đơn tìm thấy trong mô tả giao dịch (vd "...theo hóa đơn 00001974, 00002081") — đã
  // chuẩn hoá về dạng 8 chữ số (đệm 0 phía trước) để so khớp với DebtInvoice.invoiceNumber. Dùng
  // làm ưu tiên khớp #1 khi ghi nhận thanh toán, xem apps/web/src/app/api/debt/import/payments.
  candidateInvoiceNumbers: string[];
}

/** Cột trong file "Tiền về" không có dòng tiêu đề — vị trí cột cố định theo mẫu thật: Ngày, Mã
 * khách hàng, Tên khách hàng, Mô tả giao dịch, Số tiền, (cột trống), Ghi chú. */
const COL = { date: 0, customerCode: 1, customerName: 2, description: 3, amount: 4, note: 6 } as const;

/** Tìm các số hoá đơn nhắc tới trong mô tả giao dịch, theo sau cụm "hóa đơn"/"hoa don" (không
 * dấu). Đệm về đủ 8 chữ số để khớp đúng định dạng Số hóa đơn thật (vd "00002337"). */
export function extractInvoiceNumbersFromDescription(description: string | null): string[] {
  if (!description) return [];
  const norm = normalizeVN(description);
  const keyword = "hoa don";
  const results: string[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = norm.indexOf(keyword, searchFrom);
    if (idx === -1) break;
    const tail = description.slice(idx + keyword.length, idx + keyword.length + 60);
    const digitGroups = tail.match(/\d{2,8}/g) ?? [];
    for (const g of digitGroups) results.push(g.padStart(8, "0"));
    searchFrom = idx + keyword.length;
  }
  return Array.from(new Set(results));
}

export class DebtPaymentsParseError extends Error {}

export function parseDebtPaymentsExcel(buffer: Buffer): { rows: ParsedPaymentRow[]; errors: { rowNumber: number; message: string }[] } {
  const { rows } = readSheet(buffer);
  // Không có dòng tiêu đề thật — cột không có tên (Unnamed: 0..7), đọc thẳng từ dòng đầu.
  const result: { rows: ParsedPaymentRow[]; errors: { rowNumber: number; message: string }[] } = { rows: [], errors: [] };

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    const amount = parseNumber(row[COL.amount]);
    const customerCodeRaw = String(row[COL.customerCode] ?? "").trim() || null;
    const description = String(row[COL.description] ?? "").trim() || null;
    if (!amount && !customerCodeRaw && !description) return; // dòng trống, bỏ qua âm thầm

    if (!amount) {
      result.errors.push({ rowNumber, message: "Thiếu hoặc sai số tiền" });
      return;
    }

    result.rows.push({
      rowNumber,
      paymentDate: parseExcelDate(row[COL.date]),
      customerCodeRaw,
      customerCode: customerCodeRaw ? normalizeCustomerCode(customerCodeRaw) : null,
      customerName: String(row[COL.customerName] ?? "").trim() || null,
      rawDescription: description,
      amount,
      note: String(row[COL.note] ?? "").trim() || null,
      candidateInvoiceNumbers: extractInvoiceNumbersFromDescription(description),
    });
  });

  return result;
}
