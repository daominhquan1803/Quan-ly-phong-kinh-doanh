import { readSheet } from "./excel-parser";
import { PaymentTermType } from "./customer-payment-term";

export interface ParsedCustomerRow {
  rowNumber: number;
  customerCode: string;
  customerName: string | null;
  paymentTermType: PaymentTermType | null;
  paymentTermDays: number | null;
  paymentTermMonthOffset: number | null;
  // Giữ lại giá trị gốc khi không nhận diện được quy tắc (vd "CT") — báo cho admin biết, không
  // suy đoán bừa.
  unrecognizedTermRaw: string | null;
  employeeNameRaw: string | null;
}

/** Nhận diện cột "thời hạn công nợ" — hoặc là số ngày thuần (vd 30, "30", "0") = DAYS_FROM_INVOICE,
 * hoặc dạng "n+1"/"n+2"/... (không phân biệt hoa/thường, có thể có khoảng trắng) = cuối tháng
 * N+x kể từ tháng chứng từ. Giá trị khác (vd "CT") không nhận diện được, trả về unrecognized. */
function parseTermCell(raw: unknown): Pick<ParsedCustomerRow, "paymentTermType" | "paymentTermDays" | "paymentTermMonthOffset" | "unrecognizedTermRaw"> {
  const s = String(raw ?? "").trim();
  if (!s) return { paymentTermType: null, paymentTermDays: null, paymentTermMonthOffset: null, unrecognizedTermRaw: null };

  if (/^\d+$/.test(s)) {
    return { paymentTermType: "DAYS_FROM_INVOICE", paymentTermDays: Number(s), paymentTermMonthOffset: null, unrecognizedTermRaw: null };
  }
  const m = s.match(/^n\s*\+\s*(\d+)$/i);
  if (m) {
    return { paymentTermType: "END_OF_MONTH_OFFSET", paymentTermDays: null, paymentTermMonthOffset: Number(m[1]), unrecognizedTermRaw: null };
  }
  return { paymentTermType: null, paymentTermDays: null, paymentTermMonthOffset: null, unrecognizedTermRaw: s };
}

/**
 * File "Danh sách khách hàng" — cấu trúc cột CỐ ĐỊNH theo thứ tự (không dựa vào tên header, vì
 * file thật có header rỗng/thừa khoảng trắng ở cột thời hạn): Mã khách hàng | Tên khách hàng |
 * Thời hạn công nợ | Nhân viên. 1 mã khách hàng có thể xuất hiện NHIỀU dòng trong file (dữ liệu
 * thật có ~230 mã bị lặp, phần lớn là 1 dòng đầy đủ + 1 dòng thiếu tên/thời hạn) — GỘP theo mã,
 * ưu tiên giữ giá trị KHÔNG rỗng đầu tiên gặp được cho mỗi trường.
 */
export function parseCustomerListExcel(buffer: Buffer): { rows: ParsedCustomerRow[]; mergedFromDuplicates: number } {
  const { rows } = readSheet(buffer);
  const [, ...dataRows] = rows;

  const byCode = new Map<string, ParsedCustomerRow>();
  let mergedFromDuplicates = 0;

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2;
    const customerCode = String(row[0] ?? "").trim();
    if (!customerCode) return;

    const customerName = String(row[1] ?? "").trim() || null;
    const term = parseTermCell(row[2]);
    const employeeNameRaw = String(row[3] ?? "").trim() || null;

    const existing = byCode.get(customerCode);
    if (!existing) {
      byCode.set(customerCode, { rowNumber, customerCode, customerName, ...term, employeeNameRaw });
      return;
    }
    mergedFromDuplicates++;
    if (!existing.customerName && customerName) existing.customerName = customerName;
    if (!existing.paymentTermType && term.paymentTermType) {
      existing.paymentTermType = term.paymentTermType;
      existing.paymentTermDays = term.paymentTermDays;
      existing.paymentTermMonthOffset = term.paymentTermMonthOffset;
    }
    if (!existing.unrecognizedTermRaw && term.unrecognizedTermRaw) existing.unrecognizedTermRaw = term.unrecognizedTermRaw;
    if (!existing.employeeNameRaw && employeeNameRaw) existing.employeeNameRaw = employeeNameRaw;
  });

  return { rows: Array.from(byCode.values()), mergedFromDuplicates };
}
