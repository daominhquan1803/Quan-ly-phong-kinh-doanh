import ExcelJS from "exceljs";
import { NAVY, THIN_BOX, COMPANY_NAME } from "@/lib/excel-brand";
import { injectCharts, type ChartSpec } from "@/lib/excel-charts";
import { INDUSTRIES, OWNERSHIPS, STAFF_SIZES, STAGES, STATUSES } from "@/lib/customer-profile";
import { GROUP_KEYS, PRODUCT_GROUPS } from "@/lib/product-groups";
import type { CustomerReport, CustomerReportRow } from "@/lib/customer-report";

/**
 * File Excel báo cáo Danh sách khách hàng — sửa được và nhập lại được (xem customer-report-import.ts):
 *  - "Dashboard": số liệu bằng CÔNG THỨC tham chiếu sheet danh sách (sửa danh sách là dashboard tự tính lại) + biểu đồ cột Excel thật.
 *  - "Danh sách khách": 1 khách 1 dòng; cột tiêu đề màu cam = NVKD sửa được (nhập lại lên app), có ô chọn từ danh mục.
 *  - "Khách x nhóm hàng": doanh số 12 tháng từng khách theo nhóm sản phẩm.
 *  - "Danh mục": danh sách cho ô chọn.
 */
export const LIST_SHEET = "Danh sách khách";
export const HEADER_ROW = 4;
const FIRST = HEADER_ROW + 1;
const ORANGE = "FFB45309";
const ZEBRA = "FFF6F8FC";
const MONEY = "#,##0";
const DATE = "dd/mm/yyyy";

export interface ListColumn {
  key: string;
  header: string;
  width: number;
  editable?: boolean;
  value: (r: CustomerReportRow) => ExcelJS.CellValue;
  fmt?: string;
  list?: "INDUSTRY" | "STAFF" | "OWNERSHIP" | "STAGE";
}

const d = (s: string | null) => (s ? new Date(s) : null);
const lbl = <T extends Record<string, string>>(m: T, k: string | null) => (k ? (m as Record<string, string>)[k] ?? k : null);

export const LIST_COLUMNS: ListColumn[] = [
  { key: "code", header: "Mã KH", width: 14, value: (r) => r.customerCode },
  { key: "name", header: "Tên khách hàng", width: 40, value: (r) => r.customerName },
  { key: "employee", header: "NVKD phụ trách", width: 18, value: (r) => r.employeeName },
  { key: "tier", header: "Hạng", width: 7, value: (r) => (r.tier === "NGU" ? "Ngủ" : r.tier) },
  { key: "address", header: "Địa chỉ", width: 45, editable: true, value: (r) => r.address },
  { key: "province", header: "Tỉnh / TP", width: 14, editable: true, value: (r) => r.province },
  { key: "industry", header: "Ngành nghề", width: 22, editable: true, list: "INDUSTRY", value: (r) => lbl(INDUSTRIES, r.industry) },
  { key: "staffSize", header: "Quy mô nhân sự", width: 16, editable: true, list: "STAFF", value: (r) => lbl(STAFF_SIZES, r.staffSize) },
  { key: "ownership", header: "Loại hình", width: 20, editable: true, list: "OWNERSHIP", value: (r) => lbl(OWNERSHIPS, r.ownership) },
  { key: "contactPerson", header: "Người liên hệ", width: 20, editable: true, value: (r) => r.contactPerson },
  { key: "contactPhone", header: "SĐT", width: 14, editable: true, value: (r) => r.contactPhone },
  { key: "groups", header: "Đang mua (nhóm SP, % doanh số)", width: 38, value: (r) => r.groupsText || null },
  { key: "topGroup", header: "Nhóm chính", width: 18, value: (r) => (r.topGroup ? PRODUCT_GROUPS[r.topGroup] : null) },
  { key: "value12", header: "Doanh số 12 tháng", width: 16, fmt: MONEY, value: (r) => Math.round(r.value12) },
  { key: "orders12", header: "Số đơn 12 tháng", width: 10, value: (r) => r.orders12 },
  { key: "lastOrder", header: "Đơn cuối", width: 12, fmt: DATE, value: (r) => d(r.lastOrderAt) },
  { key: "potentialYear", header: "Tiềm năng/năm (VND)", width: 16, editable: true, fmt: MONEY, value: (r) => r.potentialYear },
  { key: "gap", header: "Còn khai thác", width: 15, fmt: MONEY, value: (r) => (r.gap != null ? Math.round(r.gap) : null) },
  { key: "competitors", header: "Đối thủ đang cung cấp", width: 22, editable: true, value: (r) => r.competitors },
  { key: "stage", header: "Tiến trình (NVKD xác nhận)", width: 22, editable: true, list: "STAGE", value: (r) => lbl(STAGES, r.stage) },
  { key: "stageSuggested", header: "Tiến trình app gợi ý", width: 20, value: (r) => STAGES[r.stageSuggested] },
  { key: "stageEffective", header: "Tiến trình hiện tại", width: 20, value: () => null }, // công thức
  { key: "stagePrev", header: "Tiến trình tháng trước", width: 20, value: (r) => lbl(STAGES, r.stagePrev) },
  { key: "issue", header: "Vấn đề (từ chăm sóc)", width: 30, value: (r) => (r.issue ? `${r.issue.type ?? ""} ${r.issue.note ?? ""}`.trim() : null) },
  { key: "painPoint", header: "Khó khăn NVKD ghi", width: 30, editable: true, value: (r) => r.painPoint },
  { key: "status", header: "Tình trạng hiện tại", width: 24, value: (r) => STATUSES[r.status] },
  { key: "lastTouch", header: "Chạm cuối", width: 12, fmt: DATE, value: (r) => d(r.lastTouchAt) },
  { key: "unpaid", header: "Công nợ còn", width: 14, fmt: MONEY, value: (r) => Math.round(r.unpaidDebt) || null },
  { key: "overdue", header: "Công nợ quá hạn", width: 14, fmt: MONEY, value: (r) => Math.round(r.overdueDebt) || null },
  { key: "completeness", header: "% hồ sơ", width: 9, value: (r) => r.completeness / 100, fmt: "0%" },
  { key: "missing", header: "Hồ sơ còn thiếu", width: 30, value: (r) => r.missing.join(", ") || null },
];

export const colLetter = (n: number): string => {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};
const colOf = (key: string) => colLetter(LIST_COLUMNS.findIndex((c) => c.key === key) + 1);
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const head = (cell: ExcelJS.Cell, value: string, fill = NAVY) => {
  cell.value = value;
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = solid(fill);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = THIN_BOX;
};

export interface BuildOptions {
  scopeLabel: string; // "Cả phòng" | tên NVKD
}

export async function buildCustomerReportFile(report: CustomerReport, rows: CustomerReportRow[], opts: BuildOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.calcProperties = { fullCalcOnLoad: true };
  const dash = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
  const list = wb.addWorksheet(LIST_SHEET, { views: [{ state: "frozen", xSplit: 2, ySplit: HEADER_ROW }] });
  const byGroup = wb.addWorksheet("Khách x nhóm hàng", { views: [{ state: "frozen", xSplit: 2, ySplit: 3 }] });
  const cat = wb.addWorksheet("Danh mục");

  // ---------- Danh mục ----------
  const lists: Record<string, string[]> = {
    INDUSTRY: Object.values(INDUSTRIES),
    STAFF: Object.values(STAFF_SIZES),
    OWNERSHIP: Object.values(OWNERSHIPS),
    STAGE: Object.values(STAGES),
    STATUS: Object.values(STATUSES),
    GROUP: Object.values(PRODUCT_GROUPS),
  };
  const listRef: Record<string, string> = {};
  const catHeaders: [string, string][] = [
    ["INDUSTRY", "Ngành nghề"],
    ["STAFF", "Quy mô nhân sự"],
    ["OWNERSHIP", "Loại hình"],
    ["STAGE", "Tiến trình mua hàng"],
    ["STATUS", "Tình trạng"],
    ["GROUP", "Nhóm sản phẩm"],
  ];
  catHeaders.forEach(([k, h], i) => {
    const col = i + 1;
    head(cat.getCell(1, col), h);
    cat.getColumn(col).width = 28;
    lists[k].forEach((v, j) => (cat.getCell(j + 2, col).value = v));
    listRef[k] = `'Danh mục'!$${colLetter(col)}$2:$${colLetter(col)}$${lists[k].length + 1}`;
  });

  // ---------- Danh sách khách ----------
  const last = FIRST + Math.max(rows.length, 1) - 1;
  list.mergeCells(1, 1, 1, 8);
  list.getCell(1, 1).value = `DANH SÁCH KHÁCH HÀNG — ${opts.scopeLabel.toUpperCase()}`;
  list.getCell(1, 1).font = { bold: true, size: 14, color: { argb: NAVY } };
  list.mergeCells(2, 1, 2, 12);
  list.getCell(2, 1).value =
    "Cột tiêu đề màu CAM là thông tin NVKD sửa được: sửa trực tiếp ở đây rồi vào app > Khách hàng > Hồ sơ khách hàng >\"Nhập lại từ Excel\" để cập nhật. Không đổi cột Mã KH.";
  list.getCell(2, 1).font = { italic: true, color: { argb: ORANGE } };
  LIST_COLUMNS.forEach((c, i) => {
    head(list.getCell(HEADER_ROW, i + 1), c.header, c.editable ? ORANGE : NAVY);
    list.getColumn(i + 1).width = c.width;
  });
  list.getRow(HEADER_ROW).height = 34;
  const stCol = colOf("stage");
  const sgCol = colOf("stageSuggested");
  rows.forEach((r, idx) => {
    const rowNo = FIRST + idx;
    LIST_COLUMNS.forEach((c, i) => {
      const cell = list.getCell(rowNo, i + 1);
      if (c.key === "stageEffective") {
        cell.value = { formula: `IF(${stCol}${rowNo}<>"",${stCol}${rowNo},${sgCol}${rowNo})`, result: STAGES[r.stageEffective] };
      } else {
        cell.value = c.value(r) ?? null;
      }
      if (c.fmt) cell.numFmt = c.fmt;
      cell.border = THIN_BOX;
      cell.alignment = { vertical: "top", wrapText: ["name", "address", "groups", "issue", "painPoint", "missing", "competitors"].includes(c.key) };
      if (idx % 2 === 1) cell.fill = solid(ZEBRA);
    });
  });
  for (const c of LIST_COLUMNS) {
    if (!c.list) continue;
    const L = colOf(c.key);
    for (let rowNo = FIRST; rowNo <= Math.max(last, FIRST + 200); rowNo++) {
      list.getCell(`${L}${rowNo}`).dataValidation = { type: "list", allowBlank: true, formulae: [listRef[c.list]], showErrorMessage: true, errorTitle: "Chọn từ danh sách", error: "Chọn 1 giá trị trong danh sách." };
    }
  }
  list.autoFilter = { from: { row: HEADER_ROW, column: 1 }, to: { row: HEADER_ROW, column: LIST_COLUMNS.length } };
  // % hồ sơ: đỏ < 70%, cam < 90%
  list.addConditionalFormatting({
    ref: `${colOf("completeness")}${FIRST}:${colOf("completeness")}${last}`,
    rules: [
      { type: "cellIs", operator: "lessThan", formulae: [0.7], priority: 1, style: { font: { color: { argb: "FFC8102E" }, bold: true } } },
      { type: "cellIs", operator: "lessThan", formulae: [0.9], priority: 2, style: { font: { color: { argb: ORANGE }, bold: true } } },
    ],
  });

  // ---------- Khách x nhóm hàng ----------
  byGroup.getCell(1, 1).value = "DOANH SỐ 12 THÁNG THEO NHÓM SẢN PHẨM (không gồm hàng mẫu / FOC)";
  byGroup.getCell(1, 1).font = { bold: true, size: 13, color: { argb: NAVY } };
  const gHead = ["Mã KH", "Tên khách hàng", "NVKD", ...GROUP_KEYS.map((g) => PRODUCT_GROUPS[g]), "Tổng"];
  gHead.forEach((h, i) => {
    head(byGroup.getCell(3, i + 1), h);
    byGroup.getColumn(i + 1).width = i === 1 ? 40 : i === 2 ? 18 : 14;
  });
  const buyers = rows.filter((r) => r.value12 > 0).sort((a, b) => b.value12 - a.value12);
  buyers.forEach((r, idx) => {
    const rowNo = 4 + idx;
    byGroup.getCell(rowNo, 1).value = r.customerCode;
    byGroup.getCell(rowNo, 2).value = r.customerName;
    byGroup.getCell(rowNo, 3).value = r.employeeName;
    GROUP_KEYS.forEach((g, gi) => {
      const v = Math.round(r.groups[g] ?? 0);
      const cell = byGroup.getCell(rowNo, 4 + gi);
      cell.value = v || null;
      cell.numFmt = MONEY;
    });
    const tot = byGroup.getCell(rowNo, 4 + GROUP_KEYS.length);
    tot.value = { formula: `SUM(${colLetter(4)}${rowNo}:${colLetter(3 + GROUP_KEYS.length)}${rowNo})`, result: Math.round(r.value12) };
    tot.numFmt = MONEY;
    tot.font = { bold: true };
  });
  const gLast = 3 + Math.max(buyers.length, 1);

  // ---------- Dashboard ----------
  const charts: ChartSpec[] = [];
  const S = `'${LIST_SHEET}'`;
  const rng = (key: string) => `${S}!$${colOf(key)}$${FIRST}:$${colOf(key)}$${last}`;
  dash.getColumn(1).width = 30;
  for (let c = 2; c <= 8; c++) dash.getColumn(c).width = 16;
  dash.mergeCells(1, 1, 1, 8);
  dash.getCell(1, 1).value = `BÁO CÁO DANH SÁCH KHÁCH HÀNG — ${opts.scopeLabel.toUpperCase()}`;
  dash.getCell(1, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
  dash.getCell(2, 1).value = `${COMPANY_NAME} · Lập lúc ${new Date(report.generatedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · Số liệu tính bằng công thức theo sheet "${LIST_SHEET}" — sửa danh sách thì dashboard tự tính lại. Đơn hàng trong app có từ 01/04/2026.`;
  dash.getCell(2, 1).font = { italic: true, color: { argb: "FF6B7280" } };

  // Thẻ số liệu
  const cards: [string, string, number, string?][] = [
    ["Tổng khách", `COUNTA(${rng("code")})`, rows.length],
    ["Khách mua 12 tháng", `COUNTIF(${rng("orders12")},">0")`, rows.filter((r) => r.orders12 > 0).length],
    ["Doanh số 12 tháng", `SUM(${rng("value12")})`, Math.round(rows.reduce((s, r) => s + r.value12, 0)), MONEY],
    ["Còn khai thác (tiềm năng − đã mua)", `SUM(${rng("gap")})`, Math.round(rows.reduce((s, r) => s + (r.gap ?? 0), 0)), MONEY],
    ["Khách nguy cơ", `COUNTIF(${rng("status")},"${STATUSES.RISK}")`, rows.filter((r) => r.status === "RISK").length],
    ["Mất khách", `COUNTIF(${rng("status")},"${STATUSES.LOST}")`, rows.filter((r) => r.status === "LOST").length],
    ["% hồ sơ đầy đủ (khách đang mua)", `IFERROR(AVERAGEIF(${rng("orders12")},">0",${rng("completeness")}),0)`, avg(rows.filter((r) => r.orders12 > 0).map((r) => r.completeness / 100)), "0%"],
  ];
  cards.forEach(([label, f, result, fmt], i) => {
    const col = 1 + (i % 4) * 2;
    const row = 4 + Math.floor(i / 4) * 3;
    dash.mergeCells(row, col, row, col + 1);
    dash.mergeCells(row + 1, col, row + 1, col + 1);
    const l = dash.getCell(row, col);
    l.value = label;
    l.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    l.fill = solid(NAVY);
    l.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    const v = dash.getCell(row + 1, col);
    v.value = { formula: f, result };
    v.numFmt = fmt ?? MONEY;
    v.font = { bold: true, size: 16, color: { argb: NAVY } };
    v.alignment = { horizontal: "center" };
    v.fill = solid("FFE3ECFA");
  });

  let row = 11;
  /** Bảng tổng hợp + biểu đồ cột bên phải. */
  const block = (
    title: string,
    labels: string[],
    cols: { header: string; formula: (labelCell: string) => string; result: (label: string) => number; fmt?: string }[],
    chartCols: number[],
    colors: string[]
  ) => {
    dash.mergeCells(row, 1, row, 1 + cols.length);
    const t = dash.getCell(row, 1);
    t.value = title;
    t.font = { bold: true, size: 12, color: { argb: NAVY } };
    t.border = { bottom: { style: "medium", color: { argb: NAVY } } };
    const titleRow = row;
    row++;
    head(dash.getCell(row, 1), "");
    cols.forEach((c, i) => head(dash.getCell(row, 2 + i), c.header));
    const headerRow = row;
    row++;
    const start = row;
    labels.forEach((label) => {
      dash.getCell(row, 1).value = label;
      dash.getCell(row, 1).border = THIN_BOX;
      cols.forEach((c, i) => {
        const cell = dash.getCell(row, 2 + i);
        cell.value = { formula: c.formula(`$A${row}`), result: c.result(label) };
        cell.numFmt = c.fmt ?? MONEY;
        cell.border = THIN_BOX;
      });
      row++;
    });
    const end = row - 1;
    charts.push({
      title: { ref: `Dashboard!$A$${titleRow}`, text: title },
      categoriesRef: `Dashboard!$A$${start}:$A$${end}`,
      categories: labels,
      series: chartCols.map((ci, k) => ({
        name: cols[ci].header,
        nameRef: `Dashboard!$${colLetter(2 + ci)}$${headerRow}`,
        valuesRef: `Dashboard!$${colLetter(2 + ci)}$${start}:$${colLetter(2 + ci)}$${end}`,
        values: labels.map((l) => cols[ci].result(l)),
        color: colors[k] ?? "0B2447",
      })),
      anchor: { fromCol: cols.length + 2, fromRow: titleRow - 1, toCol: cols.length + 9, toRow: Math.max(end + 1, titleRow + 13) },
    });
    row = Math.max(end + 2, titleRow + 15);
  };

  const count = (pred: (r: CustomerReportRow) => boolean) => rows.filter(pred).length;
  const sumV = (pred: (r: CustomerReportRow) => boolean) => Math.round(rows.filter(pred).reduce((s, r) => s + r.value12, 0));
  const keyBy = <T extends Record<string, string>>(m: T, label: string) => Object.keys(m).find((k) => m[k] === label) ?? "";

  block(
    "Tình trạng khách hàng",
    Object.values(STATUSES),
    [
      { header: "Số khách", formula: (a) => `COUNTIF(${rng("status")},${a})`, result: (l) => count((r) => STATUSES[r.status] === l), fmt: "0" },
      { header: "Doanh số 12 tháng", formula: (a) => `SUMIF(${rng("status")},${a},${rng("value12")})`, result: (l) => sumV((r) => STATUSES[r.status] === l) },
    ],
    [0],
    ["0B2447"]
  );
  const prevCount = (l: string) => count((r) => !!r.stagePrev && STAGES[r.stagePrev] === l);
  block(
    "Tiến trình mua hàng",
    Object.values(STAGES),
    [
      { header: "Số khách", formula: (a) => `COUNTIF(${rng("stageEffective")},${a})`, result: (l) => count((r) => STAGES[r.stageEffective] === l), fmt: "0" },
      { header: "Tháng trước", formula: (a) => `COUNTIF(${rng("stagePrev")},${a})`, result: prevCount, fmt: "0" },
      { header: "Doanh số 12 tháng", formula: (a) => `SUMIF(${rng("stageEffective")},${a},${rng("value12")})`, result: (l) => sumV((r) => STAGES[r.stageEffective] === l) },
    ],
    [0, 1],
    ["0B2447", "B45309"]
  );
  block(
    "Ngành nghề",
    [...Object.values(INDUSTRIES), "(chưa nhập)"],
    [
      { header: "Số khách", formula: (a) => `IF(${a}="(chưa nhập)",COUNTIFS(${rng("industry")},"",${rng("code")},"<>"),COUNTIF(${rng("industry")},${a}))`, result: (l) => count((r) => (l === "(chưa nhập)" ? !r.industry : (r.industry ? INDUSTRIES[r.industry as keyof typeof INDUSTRIES] : "") === l)), fmt: "0" },
      { header: "Doanh số 12 tháng", formula: (a) => `IF(${a}="(chưa nhập)",SUMIFS(${rng("value12")},${rng("industry")},""),SUMIF(${rng("industry")},${a},${rng("value12")}))`, result: (l) => sumV((r) => (l === "(chưa nhập)" ? !r.industry : (r.industry ? INDUSTRIES[r.industry as keyof typeof INDUSTRIES] : "") === l)) },
    ],
    [1],
    ["15803D"]
  );
  const groupLabels = GROUP_KEYS.map((g) => PRODUCT_GROUPS[g]);
  block(
    "Nhóm sản phẩm (doanh số 12 tháng)",
    groupLabels,
    [
      { header: "Doanh số", formula: (a) => `SUM(INDEX('Khách x nhóm hàng'!$D$4:$${colLetter(3 + GROUP_KEYS.length)}$${gLast},0,MATCH(${a},'Khách x nhóm hàng'!$D$3:$${colLetter(3 + GROUP_KEYS.length)}$3,0)))`, result: (l) => Math.round(rows.reduce((s, r) => s + (r.groups[keyBy(PRODUCT_GROUPS, l) as keyof typeof PRODUCT_GROUPS] ?? 0), 0)) },
      { header: "Số khách mua", formula: (a) => `COUNTIF(INDEX('Khách x nhóm hàng'!$D$4:$${colLetter(3 + GROUP_KEYS.length)}$${gLast},0,MATCH(${a},'Khách x nhóm hàng'!$D$3:$${colLetter(3 + GROUP_KEYS.length)}$3,0)),">0")`, result: (l) => count((r) => (r.groups[keyBy(PRODUCT_GROUPS, l) as keyof typeof PRODUCT_GROUPS] ?? 0) > 0), fmt: "0" },
    ],
    [0],
    ["7C3AED"]
  );
  const empNames = [...new Set(rows.map((r) => r.employeeName))].sort((a, b) => a.localeCompare(b, "vi"));
  if (empNames.length > 1) {
    block(
      "Theo NVKD",
      empNames,
      [
        { header: "Số khách", formula: (a) => `COUNTIF(${rng("employee")},${a})`, result: (l) => count((r) => r.employeeName === l), fmt: "0" },
        { header: "Đang mua", formula: (a) => `COUNTIFS(${rng("employee")},${a},${rng("orders12")},">0")`, result: (l) => count((r) => r.employeeName === l && r.orders12 > 0), fmt: "0" },
        { header: "Doanh số 12 tháng", formula: (a) => `SUMIF(${rng("employee")},${a},${rng("value12")})`, result: (l) => sumV((r) => r.employeeName === l) },
        { header: "Nguy cơ + mất", formula: (a) => `COUNTIFS(${rng("employee")},${a},${rng("status")},"${STATUSES.RISK}")+COUNTIFS(${rng("employee")},${a},${rng("status")},"${STATUSES.LOST}")`, result: (l) => count((r) => r.employeeName === l && (r.status === "RISK" || r.status === "LOST")), fmt: "0" },
        { header: "% hồ sơ (đang mua)", formula: (a) => `IFERROR(AVERAGEIFS(${rng("completeness")},${rng("employee")},${a},${rng("orders12")},">0"),0)`, result: (l) => avg(rows.filter((r) => r.employeeName === l && r.orders12 > 0).map((r) => r.completeness / 100)), fmt: "0%" },
      ],
      [2],
      ["0B2447"]
    );
  }

  // Top 20 + khách nguy cơ / mất (giá trị cố định tại lúc xuất)
  const staticTable = (title: string, header: string[], data: (string | number | Date | null)[][], fmts: (string | undefined)[]) => {
    dash.mergeCells(row, 1, row, header.length);
    const t = dash.getCell(row, 1);
    t.value = title;
    t.font = { bold: true, size: 12, color: { argb: NAVY } };
    t.border = { bottom: { style: "medium", color: { argb: NAVY } } };
    row++;
    header.forEach((h, i) => head(dash.getCell(row, 1 + i), h));
    row++;
    for (const r of data) {
      r.forEach((v, i) => {
        const cell = dash.getCell(row, 1 + i);
        cell.value = v;
        if (fmts[i]) cell.numFmt = fmts[i]!;
        cell.border = THIN_BOX;
      });
      row++;
    }
    row += 2;
  };
  staticTable(
    "Top 20 khách theo doanh số 12 tháng",
    ["Khách hàng", "NVKD", "Doanh số 12 tháng", "Nhóm chính", "Tiến trình", "Tình trạng", "% hồ sơ"],
    [...rows].sort((a, b) => b.value12 - a.value12).slice(0, 20).map((r) => [`${r.customerCode} — ${r.customerName}`, r.employeeName, Math.round(r.value12), r.topGroup ? PRODUCT_GROUPS[r.topGroup] : null, STAGES[r.stageEffective], STATUSES[r.status], r.completeness / 100]),
    [undefined, undefined, MONEY, undefined, undefined, undefined, "0%"]
  );
  const watch = rows.filter((r) => r.status === "RISK" || r.status === "LOST").sort((a, b) => b.value12 - a.value12);
  staticTable(
    `Khách nguy cơ / mất khách (${watch.length})`,
    ["Khách hàng", "NVKD", "Doanh số 12 tháng", "Tình trạng", "Đơn cuối", "Vấn đề", "Chạm cuối"],
    watch.map((r) => [`${r.customerCode} — ${r.customerName}`, r.employeeName, Math.round(r.value12), STATUSES[r.status], d(r.lastOrderAt), r.issue?.note ?? r.painPoint ?? null, d(r.lastTouchAt)]),
    [undefined, undefined, MONEY, undefined, DATE, undefined, DATE]
  );

  const raw = Buffer.from(await wb.xlsx.writeBuffer());
  return injectCharts(raw, "Dashboard", charts);
}

function avg(xs: number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0;
}

