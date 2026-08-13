import { readFirstSheet, parseNumber } from "./excel-parser";
import { SALES_PLAN_FIELDS, SalesPlanFieldKey } from "./sales-plan-fields";

export interface ParsedSalesPlanRow {
  rowNumber: number;
  employeeName: string;
  productCode: string | null;
  productName: string | null;
  productGroup: string | null;
  targetRevenue: number;
  targetQuantity: number | null;
}

export interface SalesPlanParseResult {
  rows: ParsedSalesPlanRow[];
  errors: { rowNumber: number; message: string }[];
}

export function parseSalesPlanWithMapping(
  buffer: Buffer,
  mapping: Partial<Record<SalesPlanFieldKey, string>>
): SalesPlanParseResult {
  const { rows } = readFirstSheet(buffer);
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow ?? []).map((h) => String(h ?? "").trim());

  const colIndex: Partial<Record<SalesPlanFieldKey, number>> = {};
  for (const field of SALES_PLAN_FIELDS) {
    const headerName = mapping[field.key];
    if (headerName) {
      const idx = headers.indexOf(headerName);
      if (idx >= 0) colIndex[field.key] = idx;
    }
  }

  const result: SalesPlanParseResult = { rows: [], errors: [] };

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2;
    const get = (key: SalesPlanFieldKey): unknown => {
      const idx = colIndex[key];
      return idx === undefined ? undefined : row[idx];
    };

    const employeeName = String(get("employeeName") ?? "").trim();
    const targetRevenueRaw = get("targetRevenue");

    if (!employeeName && (targetRevenueRaw === undefined || targetRevenueRaw === "")) return; // dòng trống

    if (!employeeName) {
      result.errors.push({ rowNumber, message: "Thiếu Nhân viên kinh doanh" });
      return;
    }

    const targetQuantityRaw = get("targetQuantity");

    result.rows.push({
      rowNumber,
      employeeName,
      productCode: String(get("productCode") ?? "").trim() || null,
      productName: String(get("productName") ?? "").trim() || null,
      productGroup: String(get("productGroup") ?? "").trim() || null,
      targetRevenue: parseNumber(targetRevenueRaw),
      targetQuantity:
        targetQuantityRaw !== undefined && targetQuantityRaw !== "" ? parseNumber(targetQuantityRaw) : null,
    });
  });

  return result;
}
