import * as XLSX from "xlsx";
import { parseNumber, parseExcelDate } from "./excel-parser";

export interface ParsedManualOrderItem {
  itemCode: string | null;
  itemName: string;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  note: string | null;
}

export interface ParsedManualOrder {
  orderCode: string;
  customerName: string;
  orderDate: Date | null;
  expectedDeliveryDate: Date | null;
  totalValue: number;
  items: ParsedManualOrderItem[];
  // Các thông tin phụ đọc được nhưng KHÔNG có cột riêng trong bảng orders (địa chỉ, mã số
  // thuế, điều kiện giao hàng/thanh toán...) — giữ lại để tham khảo, lưu vào Order.rawData.
  extra: Record<string, string>;
}

export class ManualOrderParseError extends Error {}

function normSpace(s: unknown): string {
  return String(s ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Sheet "PKD" theo đúng file mẫu "Đơn đặt hàng" nội bộ Hoàng Gia — nếu không thấy sheet tên
 * này (đổi tên/không chắc), tìm sheet đầu tiên có dòng bắt đầu bằng "Số PO" ở cột A, cuối cùng
 * mới rơi về sheet đầu tiên của file. */
function pickOrderSheet(workbook: XLSX.WorkBook): string {
  if (workbook.SheetNames.includes("PKD")) return "PKD";
  for (const name of workbook.SheetNames) {
    const ws = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });
    if (rows.some((r) => /^\s*Số PO\s*:/i.test(normSpace(r[0])))) return name;
  }
  return workbook.SheetNames[0];
}

/** "Số PO: D08.26MQ53A" -> "D08.26MQ53A" — nhãn và giá trị nằm chung 1 ô, theo sau dấu ":". */
function extractInline(rows: unknown[][], labelRegex: RegExp): string | null {
  for (const row of rows) {
    const cell = normSpace(row[0]);
    const m = cell.match(labelRegex);
    if (m) return m[1].trim() || null;
  }
  return null;
}

/** Các dòng dạng "Nhãn | : | Giá trị" trải trên nhiều ô (mỗi ô 1 cột) — ghép mọi ô có nội dung
 * SAU ô nhãn (bỏ ô chỉ có dấu ":") lại làm giá trị, để chịu được các dòng thông tin phụ có nhiều
 * ô rải rác (vd "Điều kiện thanh toán"). */
function extractBlock(rows: unknown[][], label: string): string | null {
  const target = normSpace(label).toLowerCase();
  for (const row of rows) {
    const first = normSpace(row[0]).toLowerCase();
    if (first !== target) continue;
    const parts: string[] = [];
    for (let c = 1; c < row.length; c++) {
      const v = normSpace(row[c]);
      if (!v || v === ":") continue;
      parts.push(v);
    }
    return parts.join(" ").trim() || null;
  }
  return null;
}

/**
 * Đọc file Excel "Đơn đặt hàng" theo đúng mẫu nội bộ Hoàng Gia (1 file = 1 đơn hàng) — dùng cho
 * tính năng "Thêm đơn thủ công" ở mục Đơn hàng, KHÁC với wizard nhập Excel hàng loạt hiện có
 * (nhiều đơn/dòng, cần chọn mapping cột). Không phụ thuộc số cột/dòng chính xác — tự dò theo
 * nhãn (label) và theo số thứ tự (STT) của bảng mã hàng, nên vẫn đọc được nếu file có thêm/bớt
 * vài dòng khách hàng/thông tin phụ so với mẫu.
 */
export function parseManualOrderExcel(buffer: Buffer): ParsedManualOrder {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = pickOrderSheet(workbook);
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: "" });

  const orderCode = extractInline(rows, /^Số PO\s*:\s*(.*)$/i);
  if (!orderCode) {
    throw new ManualOrderParseError('Không tìm thấy "Số PO" trong file — kiểm tra lại đúng file mẫu Đơn đặt hàng.');
  }

  const customerName = extractBlock(rows, "Tên Khách Hàng");
  if (!customerName) {
    throw new ManualOrderParseError('Không tìm thấy "Tên Khách Hàng" trong file.');
  }

  const orderDateStr = extractInline(rows, /^Ngày đặt hàng\s*:\s*(.*)$/i);
  const deliveryDateStr = extractInline(rows, /^Ngày giao hàng\s*:\s*(.*)$/i);

  // ---- Bảng mã hàng: dò dòng tiêu đề (có ô "STT"), lập bản đồ tên cột -> chỉ số cột, rồi đọc
  // liên tiếp các dòng có STT đúng thứ tự 1,2,3... (bỏ qua 1 dòng tiêu đề phụ xen giữa nếu có,
  // vd dòng "Thực tế" lặp lại dưới "Số lượng"/"Đơn giá" trong mẫu gốc). ----
  const headerRowIdx = rows.findIndex((r) => r.some((cell) => normSpace(cell).toLowerCase() === "stt"));
  if (headerRowIdx === -1) {
    throw new ManualOrderParseError('Không tìm thấy bảng mã hàng (thiếu dòng tiêu đề có ô "STT").');
  }
  const headerRow = rows[headerRowIdx];
  const colOf = new Map<string, number>();
  headerRow.forEach((cell, i) => {
    const label = normSpace(cell).toLowerCase();
    if (label) colOf.set(label, i);
  });
  const get = (row: unknown[], label: string): unknown => {
    const idx = colOf.get(label);
    return idx === undefined ? undefined : row[idx];
  };

  const items: ParsedManualOrderItem[] = [];
  let expectedStt = 1;
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    const sttRaw = get(row, "stt");
    const stt = typeof sttRaw === "number" ? sttRaw : Number(normSpace(sttRaw));
    if (stt !== expectedStt) {
      // Chưa gặp dòng hàng nào -> đây là dòng tiêu đề phụ (vd "Thực tế"), bỏ qua và đọc tiếp.
      // Đã có ít nhất 1 dòng hàng rồi mà không khớp số thứ tự tiếp theo -> hết bảng mã hàng.
      if (items.length === 0) continue;
      break;
    }
    const itemCode = normSpace(get(row, "mã hàng")) || null;
    const itemNameRaw = normSpace(get(row, "mặt hàng"));
    const itemName = itemNameRaw || itemCode || "(Không rõ tên hàng)";
    const unit = normSpace(get(row, "đvt")) || null;
    const quantity = parseNumber(get(row, "số lượng"));
    const unitPrice = parseNumber(get(row, "đơn giá"));
    const totalPriceRaw = get(row, "thành tiền thực tế") ?? get(row, "thành tiền");
    const totalPrice = totalPriceRaw !== undefined && totalPriceRaw !== "" ? parseNumber(totalPriceRaw) : quantity * unitPrice;
    const note = normSpace(get(row, "ghi chú")) || null;

    items.push({ itemCode, itemName, unit, quantity, unitPrice, totalPrice, note });
    expectedStt++;
  }

  if (items.length === 0) {
    throw new ManualOrderParseError("Không đọc được dòng mã hàng nào trong bảng — file có thể sai định dạng.");
  }

  const totalValue = items.reduce((sum, it) => sum + it.totalPrice, 0);

  const extra: Record<string, string> = {};
  const setExtra = (key: string, label: string) => {
    const v = extractBlock(rows, label);
    if (v) extra[key] = v;
  };
  setExtra("customerAddress", "Địa chỉ khách hàng");
  setExtra("taxCode", "Mã Số Thuế");
  setExtra("buyerName", "Người mua hàng");
  setExtra("orderNote", "Ghi chú đơn hàng");
  setExtra("receiverName", "Người nhận hàng");
  setExtra("deliveryAddress", "Địa chỉ giao hàng");
  setExtra("deliveryTime", "Thời gian giao hàng");
  setExtra("deliveryTerms", "Điều kiện giao hàng");
  setExtra("paymentTerms", "Điều kiện thanh toán");
  setExtra("shippingCost", "Chi phí vận chuyển");

  return {
    orderCode,
    customerName,
    orderDate: orderDateStr ? parseExcelDate(orderDateStr) : null,
    expectedDeliveryDate: deliveryDateStr ? parseExcelDate(deliveryDateStr) : null,
    totalValue,
    items,
    extra,
  };
}
