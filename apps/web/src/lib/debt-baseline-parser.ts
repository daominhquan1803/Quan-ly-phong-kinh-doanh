import { readSheet, parseExcelDate, parseNumber } from "./excel-parser";
import { normalizeCustomerCode } from "./debt-customer-match";

export interface ParsedBaselineDebtRow {
  rowNumber: number;
  customerCodeRaw: string;
  customerCode: string; // đã chuẩn hoá, dùng làm khoá
  invoiceNumber: string | null;
  invoiceDate: Date | null;
  dueDate: Date | null;
  originalAmount: number;
  paidAmount: number;
  salesEmployeeNameRaw: string | null;
  // "Kế hoạch thu Tuần N" cũ trong file gốc — giữ lại làm ghi chú tham khảo, KHÔNG suy ra ngày
  // dự kiến thanh toán cụ thể (không đủ căn cứ xác định đúng tuần của tháng nào), NVKD sẽ tự
  // điền ngày dự kiến thanh toán mới qua giao diện theo đúng yêu cầu của anh Quân.
  oldWeekPlanNote: string | null;
}

const HEADERS = {
  customerCode: "Mã khách hàng",
  invoiceDate: "Ngày chứng từ",
  invoiceNumber: "Số hóa đơn",
  dueDate: "Hạn thanh toán",
  originalAmount: "Tổng dư nợ",
  salesEmployeeName: "Tên NVKD",
  paidAmount: "Số tiền đã thu",
} as const;

const WEEK_HEADERS = [
  "Kế hoạch thu Tuần 1",
  "Kế hoạch thu Tuần 2",
  "Kế hoạch thu Tuần 3",
  "Kế hoạch thu Tuần 4",
  "Kế hoạch thu Tuần 5",
];

export class DebtBaselineParseError extends Error {}

export function parseDebtBaselineExcel(buffer: Buffer): { rows: ParsedBaselineDebtRow[]; errors: { rowNumber: number; message: string }[] } {
  const { rows } = readSheet(buffer);
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());

  const colOf = (label: string): number => headers.indexOf(label);
  const idx = {
    customerCode: colOf(HEADERS.customerCode),
    invoiceDate: colOf(HEADERS.invoiceDate),
    invoiceNumber: colOf(HEADERS.invoiceNumber),
    dueDate: colOf(HEADERS.dueDate),
    originalAmount: colOf(HEADERS.originalAmount),
    salesEmployeeName: colOf(HEADERS.salesEmployeeName),
    paidAmount: colOf(HEADERS.paidAmount),
    weeks: WEEK_HEADERS.map((h) => colOf(h)),
  };

  if (idx.customerCode === -1 || idx.originalAmount === -1) {
    throw new DebtBaselineParseError(
      `File thiếu cột bắt buộc — cần có "${HEADERS.customerCode}" và "${HEADERS.originalAmount}".`
    );
  }

  const result: { rows: ParsedBaselineDebtRow[]; errors: { rowNumber: number; message: string }[] } = { rows: [], errors: [] };

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2;
    const customerCodeRaw = String(row[idx.customerCode] ?? "").trim();
    if (!customerCodeRaw) return; // dòng trống, bỏ qua âm thầm

    const originalAmount = parseNumber(row[idx.originalAmount]);
    if (!originalAmount) {
      result.errors.push({ rowNumber, message: "Thiếu hoặc sai Tổng dư nợ" });
      return;
    }

    const weekNotes: string[] = [];
    idx.weeks.forEach((weekIdx, wi) => {
      if (weekIdx === -1) return;
      const v = row[weekIdx];
      const n = typeof v === "number" ? v : parseNumber(v);
      if (n) weekNotes.push(`Tuần ${wi + 1}: ${n.toLocaleString("vi-VN")}đ`);
    });

    result.rows.push({
      rowNumber,
      customerCodeRaw,
      customerCode: normalizeCustomerCode(customerCodeRaw),
      invoiceNumber: idx.invoiceNumber >= 0 ? String(row[idx.invoiceNumber] ?? "").trim() || null : null,
      invoiceDate: idx.invoiceDate >= 0 ? parseExcelDate(row[idx.invoiceDate]) : null,
      dueDate: idx.dueDate >= 0 ? parseExcelDate(row[idx.dueDate]) : null,
      originalAmount,
      paidAmount: idx.paidAmount >= 0 ? parseNumber(row[idx.paidAmount]) : 0,
      salesEmployeeNameRaw: idx.salesEmployeeName >= 0 ? String(row[idx.salesEmployeeName] ?? "").trim() || null : null,
      oldWeekPlanNote: weekNotes.length > 0 ? `Kế hoạch thu cũ — ${weekNotes.join(", ")}` : null,
    });
  });

  return result;
}
