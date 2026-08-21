import { readSheet, parseNumber, parseExcelDate } from "./excel-parser";
import { SHIPMENT_SLIP_FIELDS, ShipmentSlipFieldKey } from "./shipment-slip-fields";

export interface ParsedShipmentSlipItem {
  itemCode: string | null;
  itemName: string;
  warehouse: string | null;
  poSaleNumber: string | null;
  unit: string | null;
  qtyRequested: number | null;
  qtyActual: number | null;
  poCustomerItemCode: string | null;
  note: string | null;
}

export interface ParsedShipmentSlip {
  slipNumber: string;
  slipDate: Date | null;
  receiverName: string | null;
  customerName: string | null;
  deliveryAddress: string | null;
  description: string | null;
  paymentMethod: string | null;
  preparedBy: string | null;
  items: ParsedShipmentSlipItem[];
  firstRowNumber: number;
}

export interface ShipmentSlipParseResult {
  slips: ParsedShipmentSlip[];
  errors: { rowNumber: number; message: string }[];
}

/**
 * Đọc Excel phiếu đi hàng theo mapping cột đã chọn — 1 dòng Excel = 1 dòng hàng, các dòng
 * cùng "Số phiếu" được gộp thành 1 phiếu (header lấy từ dòng đầu tiên gặp của phiếu đó, các
 * dòng sau chỉ đóng góp thêm 1 dòng hàng — khớp cách các hệ thống xuất kho thường export:
 * lặp lại thông tin đầu phiếu trên mọi dòng hàng của phiếu đó).
 */
export function parseShipmentSlipsWithMapping(
  buffer: Buffer,
  mapping: Partial<Record<ShipmentSlipFieldKey, string>>,
  sheetName?: string
): ShipmentSlipParseResult {
  const { rows } = readSheet(buffer, sheetName);
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());

  const colIndex: Partial<Record<ShipmentSlipFieldKey, number>> = {};
  for (const field of SHIPMENT_SLIP_FIELDS) {
    const headerName = mapping[field.key];
    if (headerName) {
      const idx = headers.indexOf(headerName);
      if (idx >= 0) colIndex[field.key] = idx;
    }
  }

  const result: ShipmentSlipParseResult = { slips: [], errors: [] };
  const bySlipNumber = new Map<string, ParsedShipmentSlip>();

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2;
    const get = (key: ShipmentSlipFieldKey): unknown => {
      const idx = colIndex[key];
      return idx === undefined ? undefined : row[idx];
    };
    const str = (key: ShipmentSlipFieldKey): string | null => {
      const v = String(get(key) ?? "").trim();
      return v || null;
    };

    const slipNumber = str("slipNumber");
    const itemName = str("itemName");
    if (!slipNumber && !itemName) return; // dòng trống — bỏ qua âm thầm

    if (!slipNumber) {
      result.errors.push({ rowNumber, message: "Thiếu Số phiếu" });
      return;
    }
    if (!itemName) {
      result.errors.push({ rowNumber, message: "Thiếu Tên hàng" });
      return;
    }

    let slip = bySlipNumber.get(slipNumber);
    if (!slip) {
      slip = {
        slipNumber,
        slipDate: parseExcelDate(get("slipDate")),
        receiverName: str("receiverName"),
        customerName: str("customerName"),
        deliveryAddress: str("deliveryAddress"),
        description: str("description"),
        paymentMethod: str("paymentMethod"),
        preparedBy: str("preparedBy"),
        items: [],
        firstRowNumber: rowNumber,
      };
      bySlipNumber.set(slipNumber, slip);
      result.slips.push(slip);
    }

    const qtyRequestedRaw = get("qtyRequested");
    const qtyActualRaw = get("qtyActual");
    slip.items.push({
      itemCode: str("itemCode"),
      itemName,
      warehouse: str("warehouse"),
      poSaleNumber: str("poSaleNumber"),
      unit: str("unit"),
      qtyRequested: qtyRequestedRaw !== undefined && qtyRequestedRaw !== "" ? parseNumber(qtyRequestedRaw) : null,
      qtyActual: qtyActualRaw !== undefined && qtyActualRaw !== "" ? parseNumber(qtyActualRaw) : null,
      poCustomerItemCode: str("poCustomerItemCode"),
      note: str("note"),
    });
  });

  return result;
}
