import { readSheet, parseNumber } from "./excel-parser";
import { SALES_PLAN_FIELDS, SalesPlanFieldKey } from "./sales-plan-fields";

export interface ParsedSalesPlanRow {
  rowNumber: number;
  employeeName: string;
  productCode: string | null;
  productName: string | null;
  productGroup: string | null;
  year: number;
  month: number;
  targetRevenue: number;
  targetQuantity: number | null;
}

export interface SalesPlanParseResult {
  rows: ParsedSalesPlanRow[];
  errors: { rowNumber: number; message: string }[];
  /** true nếu file có dạng "pivot" — mỗi tháng 1 cột riêng (vd "Thg4.26") thay vì 1 cột doanh số duy nhất. */
  wideMode: boolean;
}

export interface MonthColumn {
  header: string;
  month: number;
  year: number;
}

/**
 * Tìm các cột dạng "Thg4.26", "Thg 4.2026" (nhãn tháng kiểu pivot table Excel hay xuất
 * ra, đã xác nhận đúng với file kế hoạch thật) — trả về đúng cột khớp năm được chọn, sắp
 * theo tháng tăng dần.
 */
export function detectMonthColumns(headers: string[], year: number): MonthColumn[] {
  const yy = String(year % 100).padStart(2, "0");
  const found: MonthColumn[] = [];
  const pattern = /thg\s*(\d{1,2})[./](\d{2,4})/i;

  for (const header of headers) {
    const m = header.match(pattern);
    if (!m) continue;
    const month = Number(m[1]);
    if (month < 1 || month > 12) continue;
    const yearPart = m[2].length === 2 ? m[2] : m[2].slice(-2);
    if (yearPart !== yy) continue;
    found.push({ header, month, year });
  }

  return found.sort((a, b) => a.month - b.month);
}

/**
 * Đọc kế hoạch kinh doanh từ Excel — hỗ trợ 2 dạng:
 *  - "Wide" (pivot table): 1 dòng = 1 (nhân viên x sản phẩm), mỗi tháng 1 cột riêng
 *    (tự phát hiện qua detectMonthColumns) — sinh ra nhiều dòng kết quả (1/tháng) từ 1 dòng Excel.
 *  - "Narrow": 1 dòng Excel = 1 (nhân viên x sản phẩm x tháng), doanh số nằm ở 1 cột duy
 *    nhất được map thủ công (mapping.targetRevenue), áp dụng cho year/month người dùng chọn.
 */
export function parseSalesPlanWithMapping(
  buffer: Buffer,
  mapping: Partial<Record<SalesPlanFieldKey, string>>,
  year: number,
  month: number,
  sheetName?: string
): SalesPlanParseResult {
  const { rows } = readSheet(buffer, sheetName);
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

  const monthColumns = detectMonthColumns(headers, year);
  const wideMode = monthColumns.length > 0;
  const monthColIndexes = monthColumns.map((mc) => ({ ...mc, idx: headers.indexOf(mc.header) }));

  const result: SalesPlanParseResult = { rows: [], errors: [], wideMode };

  dataRows.forEach((row, i) => {
    const rowNumber = i + 2;
    const get = (key: SalesPlanFieldKey): unknown => {
      const idx = colIndex[key];
      return idx === undefined ? undefined : row[idx];
    };

    const employeeName = String(get("employeeName") ?? "").trim();
    const productCode = String(get("productCode") ?? "").trim() || null;
    const productName = String(get("productName") ?? "").trim() || null;
    const productGroup = String(get("productGroup") ?? "").trim() || null;

    if (wideMode) {
      // Dòng tổng/trống ở cuối pivot table (vd "Grand Total") không có tên nhân viên — bỏ qua.
      if (!employeeName) return;

      for (const mc of monthColIndexes) {
        const raw = row[mc.idx];
        if (raw === undefined || raw === "" || raw === null) continue; // ô trống — không có kế hoạch tháng đó
        result.rows.push({
          rowNumber,
          employeeName,
          productCode,
          productName,
          productGroup,
          year: mc.year,
          month: mc.month,
          targetRevenue: parseNumber(raw),
          targetQuantity: null,
        });
      }
      return;
    }

    // Narrow mode: 1 cột doanh số duy nhất, áp dụng cho year/month được chọn trên UI.
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
      productCode,
      productName,
      productGroup,
      year,
      month,
      targetRevenue: parseNumber(targetRevenueRaw),
      targetQuantity:
        targetQuantityRaw !== undefined && targetQuantityRaw !== "" ? parseNumber(targetQuantityRaw) : null,
    });
  });

  return result;
}
