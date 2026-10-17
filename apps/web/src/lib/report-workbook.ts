import ExcelJS from "exceljs";
import { embedLogo, addCompanyHeaderLines, NAVY, THIN_BOX } from "@/lib/excel-brand";
import { DEBT_STATUS_LABEL } from "@/lib/debt-status";
import { injectCharts, type ChartSpec } from "@/lib/excel-charts";
import type { ReportData, ReportMetricDef } from "@/lib/report-metrics";

const VND_FMT = "#,##0";
const NUM_FMT = "#,##0.##";
const PCT_POINT_FMT = '0.0"%"'; // giá trị đã là "điểm phần trăm" (12.5 = 12,5%)
const CHANGE_FMT = "+0.0%;-0.0%;0.0%"; // % tăng giảm so kỳ trước (giá trị là phân số)
const RATIO_FMT = "0.0%"; // % đạt KPI (giá trị là phân số)
const DATE_FMT = "dd/mm/yyyy";
const GREEN = "FF15803D";
const RED = "FFC8102E";
const AMBER = "FFB45309";
const GRAY_TEXT = "FF6B7280";
const LINE = "FFD5DBE6";
const ZEBRA = "FFF6F8FC";
const TOTAL_FILL = "FFE3ECFA";
const DATA = "Dữ liệu";

const BOX_LIGHT: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: LINE } },
  left: { style: "thin", color: { argb: LINE } },
  bottom: { style: "thin", color: { argb: LINE } },
  right: { style: "thin", color: { argb: LINE } },
};
const solid = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

const colLetter = (n: number): string => {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

const unitFmt = (m: ReportMetricDef) => (m.unit === "pct" ? PCT_POINT_FMT : m.unit === "count" ? VND_FMT : VND_FMT);

/** Tiêu đề cột: nền xanh navy, chữ trắng đậm — dùng chung mọi sheet cho đồng nhất. */
function headerStyle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cell.fill = solid(NAVY);
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = THIN_BOX;
}

function headerCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  headerStyle(cell);
}

function changeRules(sheet: ExcelJS.Worksheet, ref: string, priority = 1) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      { type: "cellIs", operator: "greaterThan", formulae: [0], priority, style: { font: { color: { argb: GREEN }, bold: true } } },
      { type: "cellIs", operator: "lessThan", formulae: [0], priority: priority + 1, style: { font: { color: { argb: RED }, bold: true } } },
    ],
  });
}

/** Màu chữ % đạt KPI: >= 100% xanh, 70–100% cam, dưới 70% đỏ. */
function kpiRules(sheet: ExcelJS.Worksheet, ref: string, priority: number) {
  sheet.addConditionalFormatting({
    ref,
    rules: [
      { type: "cellIs", operator: "greaterThan", formulae: [0.99999], priority, style: { font: { color: { argb: GREEN }, bold: true } } },
      { type: "cellIs", operator: "between", formulae: [0.7, 0.99999], priority: priority + 1, style: { font: { color: { argb: AMBER }, bold: true } } },
      { type: "cellIs", operator: "lessThan", formulae: [0.7], priority: priority + 2, style: { font: { color: { argb: RED }, bold: true } } },
    ],
  });
}

/** Tiêu đề một khu trong Dashboard (chữ navy đậm, gạch chân xanh). */
function sectionTitle(sheet: ExcelJS.Worksheet, row: number, col1: number, col2: number, value: ExcelJS.CellValue) {
  sheet.mergeCells(row, col1, row, col2);
  const c = sheet.getCell(row, col1);
  c.value = value;
  c.font = { bold: true, size: 13, color: { argb: NAVY } };
  c.alignment = { vertical: "middle" };
  for (let k = col1; k <= col2; k++) sheet.getCell(row, k).border = { bottom: { style: "medium", color: { argb: NAVY } } };
  sheet.getRow(row).height = 24;
}

/** Thẻ số lớn (KPI card): dòng nhãn nhỏ, dòng số lớn, dòng ghi chú. */
function card(
  sheet: ExcelJS.Worksheet,
  row: number,
  col1: number,
  col2: number,
  opts: { label: string; value: ExcelJS.CellValue; fmt: string; note: string; accent: string }
) {
  for (let k = 0; k < 3; k++) sheet.mergeCells(row + k, col1, row + k, col2);
  const fill = solid("FFF4F7FC");
  const label = sheet.getCell(row, col1);
  label.value = opts.label;
  label.font = { bold: true, size: 10, color: { argb: GRAY_TEXT } };
  label.alignment = { horizontal: "center", vertical: "middle" };
  const value = sheet.getCell(row + 1, col1);
  value.value = opts.value;
  value.numFmt = opts.fmt;
  value.font = { bold: true, size: 24, color: { argb: opts.accent } };
  value.alignment = { horizontal: "center", vertical: "middle" };
  const note = sheet.getCell(row + 2, col1);
  note.value = opts.note;
  note.font = { italic: true, size: 9, color: { argb: GRAY_TEXT } };
  note.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  for (let k = 0; k < 3; k++) {
    for (let c = col1; c <= col2; c++) {
      const cell = sheet.getCell(row + k, c);
      cell.fill = fill;
      cell.border = {
        ...(k === 0 ? { top: { style: "thick", color: { argb: opts.accent } } } : {}),
        left: c === col1 ? { style: "thin", color: { argb: LINE } } : undefined,
        right: c === col2 ? { style: "thin", color: { argb: LINE } } : undefined,
        bottom: k === 2 ? { style: "thin", color: { argb: LINE } } : undefined,
      };
    }
  }
  sheet.getRow(row).height = 20;
  sheet.getRow(row + 1).height = 40;
  sheet.getRow(row + 2).height = 20;
}

/**
 * Dựng file Excel báo cáo tuần/tháng. Sheet "Dashboard" có 2 ô chọn (Nhân viên, Chỉ số) — mọi số trên
 * Dashboard là công thức SUMIFS lên sheet "Dữ liệu" nên đổi ô chọn là số đổi theo (Excel tự tính lại
 * khi mở, `fullCalcOnLoad`); kèm giá trị tính sẵn cho trình xem không chạy công thức. Đầu Dashboard có
 * khối "Doanh số đi hàng so với KPI" (4 thẻ số + bảng từng nhân viên, thanh tiến độ).
 */
async function buildWorkbookAndCharts(data: ReportData): Promise<{ workbook: ExcelJS.Workbook; charts: ChartSpec[] }> {
  const charts: ChartSpec[] = [];
  const wb = new ExcelJS.Workbook();
  wb.calcProperties = { fullCalcOnLoad: true };
  const { periods, metrics, rows } = data;
  const typeLabel = data.type === "month" ? "THÁNG" : "TUẦN";
  const cur = periods[0];
  const employeeOptions = [...(data.totalLabel ? [data.totalLabel] : []), ...data.employeeNames];
  const defaultEmployee = employeeOptions[0] ?? "";
  const defaultMetric = metrics.find((m) => m.key === "delivered") ?? metrics[0];
  const metricOf = (key: string) => metrics.find((m) => m.key === key)!;
  const valueOf = (employee: string, key: string, i: number): number | null =>
    rows.find((r) => r.employee === employee && r.metricKey === key)?.values[i] ?? null;

  // ========== Sheet Dashboard (tạo trước để đứng đầu) ==========
  const dash = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false, zoomScale: 90 }] });
  const dataSheet = wb.addWorksheet(DATA);
  const debtSheet = wb.addWorksheet("Công nợ");
  const overdueSheet = wb.addWorksheet("HĐ quá hạn");
  const planSheet = wb.addWorksheet("Kế hoạch thu");
  const newCusSheet = wb.addWorksheet("Khách hàng mới");
  const notesSheet = wb.addWorksheet("Cách tính");
  const listSheet = wb.addWorksheet("Danh mục", { state: "hidden" });

  // ========== Sheet Dữ liệu (bảng thô, lọc được) ==========
  const dataHeaders = ["Nhân viên", "Nhóm", "Chỉ số", "Đơn vị", `${cur.label} (kỳ này)`, `${periods[1].label} (kỳ -1)`, `${periods[2].label} (kỳ -2)`, "% so kỳ -1", "% so kỳ -2"];
  dataHeaders.forEach((h, i) => headerCell(dataSheet.getCell(1, i + 1), h));
  dataSheet.getRow(1).height = 30;
  [20, 14, 42, 9, 18, 18, 18, 12, 12].forEach((w, i) => (dataSheet.getColumn(i + 1).width = w));
  const unitLabel = { vnd: "đ", count: "số", pct: "%" } as const;
  let dr = 2;
  for (const r of rows) {
    const m = metricOf(r.metricKey);
    dataSheet.getCell(dr, 1).value = r.employee;
    dataSheet.getCell(dr, 2).value = m.group;
    dataSheet.getCell(dr, 3).value = m.label;
    dataSheet.getCell(dr, 4).value = unitLabel[m.unit];
    r.values.forEach((v, i) => {
      if (v === null) return;
      const c = dataSheet.getCell(dr, 5 + i);
      c.value = v;
      c.numFmt = unitFmt(m);
    });
    for (const [col, prev] of [[8, "F"], [9, "G"]] as const) {
      if (m.multi) {
        const c = dataSheet.getCell(dr, col);
        const base = r.values[col === 8 ? 1 : 2];
        c.value = { formula: `IF(OR(${prev}${dr}="",${prev}${dr}=0),"",E${dr}/${prev}${dr}-1)`, result: base ? (r.values[0]! / base - 1) : "" };
        c.numFmt = CHANGE_FMT;
      }
    }
    for (let c = 1; c <= 9; c++) {
      dataSheet.getCell(dr, c).border = BOX_LIGHT;
      if (dr % 2 === 1) dataSheet.getCell(dr, c).fill = solid(ZEBRA);
    }
    dr++;
  }
  const lastData = Math.max(dr - 1, 2);
  dataSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: lastData, column: 9 } };
  dataSheet.views = [{ state: "frozen", ySplit: 1 }];
  changeRules(dataSheet, `H2:I${lastData}`);
  const rng = (col: string) => `'${DATA}'!$${col}$2:$${col}$${lastData}`;

  // ========== Sheet Danh mục (nguồn cho 2 ô chọn) ==========
  employeeOptions.forEach((e, i) => (listSheet.getCell(i + 1, 1).value = e));
  metrics.forEach((m, i) => (listSheet.getCell(i + 1, 2).value = m.label));

  // ========== Dashboard ==========
  // A nhóm | B chỉ số | C-E ba kỳ | F-G % so kỳ trước || H cách | I nhân viên | J-L ba kỳ | M-N %.
  [13, 38, 17, 17, 17, 11, 11, 2, 24, 17, 17, 17, 11, 11].forEach((w, i) => (dash.getColumn(i + 1).width = w));
  dash.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  await embedLogo(wb, dash);
  let r = addCompanyHeaderLines(dash, 1, 3, 5);
  r++;
  // Biểu ngữ tiêu đề
  dash.mergeCells(r, 1, r, 14);
  const banner = dash.getCell(r, 1);
  banner.value = `BÁO CÁO ${typeLabel} — ${cur.label}`;
  banner.font = { bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  banner.fill = solid(NAVY);
  banner.alignment = { horizontal: "center", vertical: "middle" };
  dash.getRow(r).height = 38;
  r++;
  dash.mergeCells(r, 1, r, 14);
  const asOfText = data.asOf ? `chốt cuối ngày ${data.asOf.toLocaleDateString("vi-VN")}` : "số hiện tại";
  const sub = dash.getCell(r, 1);
  sub.value = `Xuất lúc ${data.generatedAt.toLocaleString("vi-VN")} — công nợ ${asOfText}. So sánh với 2 ${data.type === "month" ? "tháng" : "tuần"} trước.`;
  sub.font = { italic: true, size: 10, color: { argb: GRAY_TEXT } };
  sub.alignment = { horizontal: "center", vertical: "middle" };
  dash.getRow(r).height = 20;
  r += 2;

  // ---- Khối 1: Doanh số đi hàng so với KPI ----
  const kpiRows = data.kpi.rows;
  const kpiTotal = kpiRows[0]; // "Cả phòng" nếu có, không thì chính người xem
  sectionTitle(dash, r, 1, 14, `DOANH SỐ ĐI HÀNG SO VỚI KPI — ${data.kpi.periodLabel}`);
  r++;
  const cardRow = r + 1;
  r = cardRow;
  const pctOf = (delivered: number, target: number) => (target > 0 ? delivered / target : "");
  const diff = kpiTotal ? kpiTotal.delivered - kpiTotal.target : 0;
  const achieved = kpiTotal && kpiTotal.target > 0 ? kpiTotal.delivered / kpiTotal.target : null;
  const accentPct = achieved === null ? GRAY_TEXT : achieved >= 1 ? GREEN : achieved >= 0.7 ? AMBER : RED;
  card(dash, cardRow, 1, 2, {
    label: data.totalLabel ? "TỔNG DOANH SỐ ĐI HÀNG (CẢ PHÒNG)" : "TỔNG DOANH SỐ ĐI HÀNG",
    value: kpiTotal?.delivered ?? 0,
    fmt: '#,##0" đ"',
    note: data.kpi.periodLabel,
    accent: NAVY,
  });
  card(dash, cardRow, 3, 5, {
    label: "KPI — CHỈ TIÊU DOANH SỐ THÁNG",
    value: kpiTotal?.target ?? 0,
    fmt: '#,##0" đ"',
    note: data.type === "month" ? "Tổng chỉ tiêu các nhân viên" : "Báo cáo tuần so luỹ kế tháng với chỉ tiêu cả tháng",
    accent: "FF1D4ED8",
  });
  // Thẻ % đạt: công thức tham chiếu 2 thẻ trên để đổi số là đổi theo.
  card(dash, cardRow, 6, 10, {
    label: "ĐẠT SO VỚI KPI",
    value: { formula: `IF(C${cardRow + 1}=0,"",A${cardRow + 1}/C${cardRow + 1})`, result: achieved === null ? "" : achieved },
    fmt: RATIO_FMT,
    note: achieved === null ? "Chưa đặt chỉ tiêu" : achieved >= 1 ? "Đã đạt / vượt KPI" : "Chưa đạt KPI",
    accent: accentPct,
  });
  card(dash, cardRow, 11, 14, {
    label: diff >= 0 ? "VƯỢT KPI" : "CÒN THIẾU SO VỚI KPI",
    value: { formula: `ABS(A${cardRow + 1}-C${cardRow + 1})`, result: Math.abs(diff) },
    fmt: '#,##0" đ"',
    note: diff >= 0 ? "Doanh số đi hàng trừ KPI" : "KPI trừ doanh số đi hàng",
    accent: diff >= 0 ? GREEN : RED,
  });
  r = cardRow + 4;

  // ---- Bảng KPI theo nhân viên ----
  const kHead = r;
  headerCell(dash.getCell(kHead, 1), "Hạng");
  headerCell(dash.getCell(kHead, 2), "Nhân viên");
  headerCell(dash.getCell(kHead, 3), "Doanh số đi hàng");
  headerCell(dash.getCell(kHead, 4), "KPI (chỉ tiêu)");
  headerCell(dash.getCell(kHead, 5), "Còn thiếu / vượt");
  dash.mergeCells(kHead, 6, kHead, 7);
  headerCell(dash.getCell(kHead, 6), "% đạt KPI");
  headerStyle(dash.getCell(kHead, 7)); // ô phụ của vùng gộp: chỉ tô kiểu, không ghi giá trị (sẽ ghi đè ô chính)
  dash.mergeCells(kHead, 9, kHead, 14);
  headerCell(dash.getCell(kHead, 9), "Tiến độ so với KPI (mỗi ô vuông = 5%)");
  for (let c = 10; c <= 14; c++) headerStyle(dash.getCell(kHead, c));
  dash.getRow(kHead).height = 26;
  // Hạng theo % đạt giữa các nhân viên (không tính dòng Cả phòng); nhân viên chưa có KPI xếp cuối, không đánh hạng.
  const ranked = kpiRows
    .filter((x) => x.employee !== data.totalLabel && x.target > 0)
    .sort((a, b) => b.delivered / b.target - a.delivered / a.target)
    .map((x) => x.employee);
  kpiRows.forEach((k, i) => {
    const row = kHead + 1 + i;
    const isTotal = k.employee === data.totalLabel;
    const pct = k.target > 0 ? k.delivered / k.target : null;
    dash.getCell(row, 1).value = isTotal ? "" : ranked.includes(k.employee) ? ranked.indexOf(k.employee) + 1 : "";
    dash.getCell(row, 2).value = k.employee;
    dash.getCell(row, 3).value = k.delivered;
    dash.getCell(row, 4).value = k.target;
    dash.getCell(row, 5).value = { formula: `IF(D${row}=0,"",C${row}-D${row})`, result: k.target > 0 ? k.delivered - k.target : "" };
    dash.mergeCells(row, 6, row, 7);
    dash.getCell(row, 6).value = { formula: `IF(D${row}=0,"",C${row}/D${row})`, result: pct === null ? "" : pct };
    dash.mergeCells(row, 9, row, 14);
    dash.getCell(row, 9).value = {
      formula: `IF(D${row}=0,"",REPT("█",MIN(ROUND(C${row}/D${row}*20,0),30)))`,
      result: pct === null ? "" : "█".repeat(Math.min(Math.round(pct * 20), 30)),
    };
    dash.getCell(row, 9).font = { color: { argb: pct === null ? GRAY_TEXT : pct >= 1 ? GREEN : pct >= 0.7 ? AMBER : RED }, size: 11 };
    for (const c of [3, 4]) dash.getCell(row, c).numFmt = VND_FMT;
    dash.getCell(row, 5).numFmt = "+#,##0;-#,##0;0";
    dash.getCell(row, 6).numFmt = RATIO_FMT;
    dash.getCell(row, 1).alignment = { horizontal: "center" };
    dash.getCell(row, 6).alignment = { horizontal: "center" };
    dash.getCell(row, 9).alignment = { horizontal: "left", vertical: "middle" };
    for (const c of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14]) {
      const cell = dash.getCell(row, c);
      cell.border = BOX_LIGHT;
      cell.fill = solid(isTotal ? TOTAL_FILL : i % 2 === 0 ? "FFFFFFFF" : ZEBRA);
      if (isTotal && c <= 6) cell.font = { bold: true, color: { argb: NAVY } };
    }
    dash.getRow(row).height = 22;
  });
  const kLast = kHead + kpiRows.length;
  kpiRules(dash, `F${kHead + 1}:F${kLast}`, 1);
  changeRules(dash, `E${kHead + 1}:E${kLast}`, 4);
  dash.getCell(kLast + 1, 1).value = "KPI = chỉ tiêu doanh số tháng của từng nhân viên (trang Kế hoạch kinh doanh). Doanh số đi hàng = tổng giá trị các đợt giao thật trong kỳ.";
  dash.getCell(kLast + 1, 1).font = { italic: true, size: 9, color: { argb: GRAY_TEXT } };
  r = kLast + 3;

  // ---- Bộ lọc: chọn nhân viên / chỉ số ----
  sectionTitle(dash, r, 1, 14, "CHI TIẾT CHỈ SỐ");
  r++;
  const selEmpRow = r;
  const selMetricRow = r + 1;
  for (const [row, label, def, list] of [
    [selEmpRow, "Nhân viên:", defaultEmployee, `'Danh mục'!$A$1:$A$${Math.max(employeeOptions.length, 1)}`],
    [selMetricRow, "Chỉ số xếp hạng:", defaultMetric.label, `'Danh mục'!$B$1:$B$${metrics.length}`],
  ] as const) {
    dash.getCell(row, 1).value = label;
    dash.getCell(row, 1).font = { bold: true, color: { argb: NAVY } };
    dash.mergeCells(row, 2, row, 3);
    const c = dash.getCell(row, 2);
    c.value = def;
    c.font = { bold: true, size: 12 };
    c.fill = solid("FFFEF3C7");
    c.border = THIN_BOX;
    c.dataValidation = { type: "list", allowBlank: false, formulae: [list], showErrorMessage: true, errorTitle: "Chọn từ danh sách", error: "Hãy chọn một giá trị trong danh sách." };
    dash.getRow(row).height = 22;
  }
  dash.getCell(selEmpRow, 4).value = "← bấm ô vàng để chọn từ danh sách";
  dash.getCell(selEmpRow, 4).font = { italic: true, color: { argb: GRAY_TEXT } };
  const EMP = `$B$${selEmpRow}`;
  const MET = `$B$${selMetricRow}`;
  r = selMetricRow + 2;

  // --- Bảng 1: tất cả chỉ số của nhân viên đã chọn ---
  const t1Title = r;
  dash.mergeCells(t1Title, 1, t1Title, 7);
  dash.getCell(t1Title, 1).value = { formula: `"TẤT CẢ CHỈ SỐ — "&${EMP}`, result: `TẤT CẢ CHỈ SỐ — ${defaultEmployee}` };
  dash.getCell(t1Title, 1).font = { bold: true, size: 12, color: { argb: NAVY } };
  dash.getRow(t1Title).height = 22;
  const t1Head = r + 1;
  ["Nhóm", "Chỉ số", `${cur.label}`, `${periods[1].label}`, `${periods[2].label}`, "% so kỳ -1", "% so kỳ -2"].forEach((h, i) => headerCell(dash.getCell(t1Head, i + 1), h));
  dash.getRow(t1Head).height = 36;
  const groupFill: Record<string, string> = {
    "Doanh số": "FFDBEAFE",
    "Khách hàng": "FFDCFCE7",
    "Công tác": "FFFEF3C7",
    "Công nợ": "FFFEE2E2",
    "Kế hoạch thu": "FFEDE9FE",
  };
  metrics.forEach((m, k) => {
    const row = t1Head + 1 + k;
    dash.getCell(row, 1).value = m.group;
    dash.getCell(row, 2).value = m.label;
    for (let i = 0; i < 3; i++) {
      const col = "EFG"[i];
      const c = dash.getCell(row, 3 + i);
      const cond = `${rng("A")},${EMP},${rng("C")},$B${row}`;
      const computed = valueOf(defaultEmployee, m.key, i);
      c.value = {
        formula: `IF(COUNTIFS(${cond},${rng(col)},"<>")=0,"",SUMIFS(${rng(col)},${cond}))`,
        result: computed === null ? "" : computed,
      };
      c.numFmt = unitFmt(m);
    }
    for (const [i, prev] of [[0, "D"], [1, "E"]] as const) {
      const c = dash.getCell(row, 6 + i);
      const base = valueOf(defaultEmployee, m.key, i + 1);
      const curV = valueOf(defaultEmployee, m.key, 0);
      c.value = {
        formula: `IF(OR(C${row}="",${prev}${row}="",${prev}${row}=0),"",C${row}/${prev}${row}-1)`,
        result: m.multi && base && curV !== null ? curV / base - 1 : "",
      };
      c.numFmt = CHANGE_FMT;
      c.alignment = { horizontal: "center" };
    }
    for (let c = 1; c <= 7; c++) {
      const cell = dash.getCell(row, c);
      cell.border = BOX_LIGHT;
      if (c === 2) cell.alignment = { horizontal: "left", vertical: "middle" };
      if (c >= 2) cell.fill = solid(k % 2 === 0 ? "FFFFFFFF" : ZEBRA);
    }
    dash.getRow(row).height = 20;
  });
  // Cột Nhóm: gộp ô theo nhóm, mỗi nhóm một màu nhạt.
  for (let k = 0; k < metrics.length; ) {
    let e = k;
    while (e + 1 < metrics.length && metrics[e + 1].group === metrics[k].group) e++;
    const top = t1Head + 1 + k;
    const bottom = t1Head + 1 + e;
    if (bottom > top) dash.mergeCells(top, 1, bottom, 1);
    const g = dash.getCell(top, 1);
    g.font = { bold: true, color: { argb: NAVY } };
    g.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    for (let rr = top; rr <= bottom; rr++) {
      dash.getCell(rr, 1).fill = solid(groupFill[metrics[k].group] ?? "FFF3F4F6");
      dash.getCell(rr, 1).border = BOX_LIGHT;
    }
    k = e + 1;
  }
  const t1Last = t1Head + metrics.length;
  changeRules(dash, `F${t1Head + 1}:G${t1Last}`);

  // --- Bảng 2: xếp hạng nhân viên theo chỉ số đã chọn ---
  dash.mergeCells(t1Title, 9, t1Title, 14);
  dash.getCell(t1Title, 9).value = { formula: `"XẾP HẠNG — "&${MET}`, result: `XẾP HẠNG — ${defaultMetric.label}` };
  dash.getCell(t1Title, 9).font = { bold: true, size: 12, color: { argb: NAVY } };
  ["Nhân viên", `${cur.label}`, `${periods[1].label}`, `${periods[2].label}`, "% so kỳ -1", "% so kỳ -2"].forEach((h, i) => headerCell(dash.getCell(t1Head, 9 + i), h));
  employeeOptions.forEach((name, k) => {
    const row = t1Head + 1 + k;
    dash.getCell(row, 9).value = name;
    for (let i = 0; i < 3; i++) {
      const col = "EFG"[i];
      const c = dash.getCell(row, 10 + i);
      const cond = `${rng("A")},$I${row},${rng("C")},${MET}`;
      const computed = valueOf(name, defaultMetric.key, i);
      c.value = {
        formula: `IF(COUNTIFS(${cond},${rng(col)},"<>")=0,"",SUMIFS(${rng(col)},${cond}))`,
        result: computed === null ? "" : computed,
      };
      c.numFmt = NUM_FMT;
    }
    for (const [i, prev] of [[0, "K"], [1, "L"]] as const) {
      const c = dash.getCell(row, 13 + i);
      const base = valueOf(name, defaultMetric.key, i + 1);
      const curV = valueOf(name, defaultMetric.key, 0);
      c.value = {
        formula: `IF(OR(J${row}="",${prev}${row}="",${prev}${row}=0),"",J${row}/${prev}${row}-1)`,
        result: defaultMetric.multi && base && curV !== null ? curV / base - 1 : "",
      };
      c.numFmt = CHANGE_FMT;
      c.alignment = { horizontal: "center" };
    }
    const isTotal = name === data.totalLabel;
    for (let c = 9; c <= 14; c++) {
      const cell = dash.getCell(row, c);
      cell.border = BOX_LIGHT;
      cell.fill = solid(isTotal ? TOTAL_FILL : k % 2 === 0 ? "FFFFFFFF" : ZEBRA);
      if (isTotal) cell.font = { bold: true, color: { argb: NAVY } };
    }
  });
  const t2Last = t1Head + employeeOptions.length;
  if (employeeOptions.length > 0) {
    // Tô thang màu cho cột kỳ này (đậm = cao hơn) — bỏ dòng "Cả phòng" ra khỏi thang đo để không át các
    // nhân viên. Dùng thang màu thay vì thanh dữ liệu vì ExcelJS ghi thanh dữ liệu kèm khối mở rộng rỗng,
    // dễ khiến Excel báo file lỗi.
    const firstEmployeeRow = t1Head + 1 + (data.totalLabel ? 1 : 0);
    if (firstEmployeeRow <= t2Last) {
      dash.addConditionalFormatting({
        ref: `J${firstEmployeeRow}:J${t2Last}`,
        rules: [
          {
            type: "colorScale",
            priority: 3,
            cfvo: [{ type: "min" }, { type: "max" }],
            color: [{ argb: "FFFFFFFF" }, { argb: "FF60A5FA" }],
          },
        ],
      });
    }
    changeRules(dash, `M${t1Head + 1}:N${t2Last}`, 4);
  }
  dash.getCell(Math.max(t1Last, t2Last) + 2, 1).value = "Ô xanh đậm = giá trị cao hơn giữa các nhân viên (không tính dòng Cả phòng). Xem định nghĩa từng chỉ số ở sheet \"Cách tính\".";
  dash.getCell(Math.max(t1Last, t2Last) + 2, 1).font = { italic: true, size: 9, color: { argb: GRAY_TEXT } };
  // ---- Biểu đồ (chèn vào file sau khi ghi — xem lib/excel-charts.ts). Tiêu đề lấy từ 1 ô nằm ngay dưới
  // biểu đồ (bị biểu đồ che) nên tiêu đề biểu đồ đổi theo ô chọn nhân viên/chỉ số. ----
  const chartRow1 = Math.max(t1Last, t2Last) + 4; // dòng (1-based) đặt ô tiêu đề + đầu biểu đồ hàng 1
  const chartRow2 = chartRow1 + 20;
  const CHART_ROWS = 18;
  const titleCell = (row: number, col: number, formula: string | null, text: string) => {
    const c = dash.getCell(row, col);
    c.value = formula ? { formula, result: text } : text;
    c.font = { bold: true, color: { argb: NAVY } };
    return `Dashboard!$${colLetter(col)}$${row}`;
  };
  const anchor = (row: number, right: boolean) => ({
    fromCol: right ? 8 : 0,
    fromRow: row - 1,
    toCol: right ? 14 : 7,
    toRow: row - 1 + CHART_ROWS,
  });
  const periodColors = ["1D4ED8", "60A5FA", "BFDBFE"];
  const periodNames = periods.map((p) => p.label);

  // 1) Doanh số của nhân viên đã chọn qua 3 kỳ (4 chỉ số doanh số đầu bảng 1)
  const salesMetrics = metrics.slice(0, 4);
  const salesTitle = `DOANH SỐ — ${defaultEmployee}`;
  charts.push({
    title: { ref: titleCell(chartRow1, 1, `"DOANH SỐ — "&${EMP}`, salesTitle), text: salesTitle },
    categoriesRef: `Dashboard!$B$${t1Head + 1}:$B$${t1Head + salesMetrics.length}`,
    categories: salesMetrics.map((m) => m.label),
    series: [0, 1, 2].map((i) => ({
      name: periodNames[i],
      nameRef: `Dashboard!$${colLetter(3 + i)}$${t1Head}`,
      valuesRef: `Dashboard!$${colLetter(3 + i)}$${t1Head + 1}:$${colLetter(3 + i)}$${t1Head + salesMetrics.length}`,
      values: salesMetrics.map((m) => valueOf(defaultEmployee, m.key, i)),
      color: periodColors[i],
    })),
    anchor: anchor(chartRow1, false),
  });

  // 2) Xếp hạng nhân viên theo chỉ số đã chọn (bỏ dòng Cả phòng)
  const rankFirst = t1Head + 1 + (data.totalLabel ? 1 : 0);
  if (rankFirst <= t2Last) {
    const rankTitle = `XẾP HẠNG — ${defaultMetric.label}`;
    charts.push({
      title: { ref: titleCell(chartRow1, 9, `"XẾP HẠNG — "&${MET}`, rankTitle), text: rankTitle },
      categoriesRef: `Dashboard!$I$${rankFirst}:$I$${t2Last}`,
      categories: data.employeeNames,
      series: [0, 1, 2].map((i) => ({
        name: periodNames[i],
        nameRef: `Dashboard!$${colLetter(10 + i)}$${t1Head}`,
        valuesRef: `Dashboard!$${colLetter(10 + i)}$${rankFirst}:$${colLetter(10 + i)}$${t2Last}`,
        values: data.employeeNames.map((n) => valueOf(n, defaultMetric.key, i)),
        color: periodColors[i],
      })),
      anchor: anchor(chartRow1, true),
    });
  }

  // 3) Công nợ theo nhân viên (tổng nợ / quá hạn / nợ xấu) và 4) Kế hoạch thu vs đã thu
  const debtFirst = 2 + (data.totalLabel ? 1 : 0);
  const debtLast = employeeOptions.length + 1;
  if (debtFirst <= debtLast) {
    const debtSeries: [string, string, string, string][] = [
      ["debt_total", "B", "1D4ED8", "Tổng công nợ"],
      ["debt_overdue", "C", "C8102E", "Công nợ quá hạn"],
      ["debt_bad", "E", "7F1D1D", "Nợ xấu (>180 ngày)"],
    ];
    const debtTitle = `CÔNG NỢ THEO NHÂN VIÊN (${asOfText})`;
    charts.push({
      title: { ref: titleCell(chartRow2, 1, null, debtTitle), text: debtTitle },
      categoriesRef: `'Công nợ'!$A$${debtFirst}:$A$${debtLast}`,
      categories: data.employeeNames,
      series: debtSeries.map(([key, col, color, name]) => ({
        name,
        nameRef: `'Công nợ'!$${col}$1`,
        valuesRef: `'Công nợ'!$${col}$${debtFirst}:$${col}$${debtLast}`,
        values: data.employeeNames.map((n) => valueOf(n, key, 0)),
        color,
      })),
      anchor: anchor(chartRow2, false),
    });

    const nbk = data.plan.bucketLabels.length;
    const planFirst = 3 + (data.totalLabel ? 1 : 0);
    const planLast = 2 + data.plan.rows.length;
    const sumOf = (a: number[]) => a.reduce((x, y) => x + y, 0);
    const planByName = new Map(data.plan.rows.map((r) => [r.employee, r]));
    const planSeries: [number, string, string, (n: string) => number][] = [
      [2 + nbk * 2, "Tổng kế hoạch", "1D4ED8", (n) => sumOf(planByName.get(n)?.planned ?? [])],
      [3 + nbk * 2, "Tổng đã thu", "15803D", (n) => sumOf(planByName.get(n)?.collected ?? [])],
    ];
    const planTitle = "KẾ HOẠCH THU THEO NHÂN VIÊN";
    charts.push({
      title: { ref: titleCell(chartRow2, 9, null, planTitle), text: planTitle },
      categoriesRef: `'Kế hoạch thu'!$A$${planFirst}:$A$${planLast}`,
      categories: data.employeeNames,
      series: planSeries.map(([col, name, color, valueFor]) => ({
        name,
        nameRef: `'Kế hoạch thu'!$${colLetter(col)}$1`,
        valuesRef: `'Kế hoạch thu'!$${colLetter(col)}$${planFirst}:$${colLetter(col)}$${planLast}`,
        values: data.employeeNames.map(valueFor),
        color,
      })),
      anchor: anchor(chartRow2, true),
    });
  }

  // Bỏ cố định hàng đầu: khối tiêu đề + KPI cao nên cố định sẽ chiếm hết màn hình.
  dash.views = [{ showGridLines: false, zoomScale: 90 }];

  // ========== Sheet Công nợ (tổng hợp theo nhân viên) ==========
  const debtKeys = ["debt_total", "debt_overdue", "debt_overdue_rate", "debt_bad", "debt_nodue", "debt_open_count", "debt_noschedule_count", "debt_noschedule_amount"];
  [20, ...debtKeys.map(() => 18)].forEach((w, i) => (debtSheet.getColumn(i + 1).width = w));
  headerCell(debtSheet.getCell(1, 1), "Nhân viên");
  debtKeys.forEach((k, i) => headerCell(debtSheet.getCell(1, i + 2), metricOf(k).label));
  debtSheet.getRow(1).height = 44;
  employeeOptions.forEach((name, k) => {
    debtSheet.getCell(k + 2, 1).value = name;
    debtKeys.forEach((key, i) => {
      const c = debtSheet.getCell(k + 2, i + 2);
      c.value = valueOf(name, key, 0);
      c.numFmt = unitFmt(metricOf(key));
    });
    for (let c = 1; c <= debtKeys.length + 1; c++) {
      debtSheet.getCell(k + 2, c).border = BOX_LIGHT;
      if (name === data.totalLabel) {
        debtSheet.getCell(k + 2, c).font = { bold: true, color: { argb: NAVY } };
        debtSheet.getCell(k + 2, c).fill = solid(TOTAL_FILL);
      } else if (k % 2 === 1) debtSheet.getCell(k + 2, c).fill = solid(ZEBRA);
    }
  });
  debtSheet.getCell(employeeOptions.length + 3, 1).value = `Công nợ ${asOfText}.`;
  debtSheet.getCell(employeeOptions.length + 3, 1).font = { italic: true, color: { argb: GRAY_TEXT } };
  debtSheet.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];

  // ========== Sheet HĐ quá hạn (danh sách lọc được) ==========
  const odHeaders = ["STT", "Nhân viên", "Mã khách", "Tên khách hàng", "Số hoá đơn", "Hạn thanh toán", "Số ngày quá hạn", "Còn phải thu", "Trạng thái"];
  [6, 20, 16, 40, 14, 15, 14, 18, 14].forEach((w, i) => (overdueSheet.getColumn(i + 1).width = w));
  odHeaders.forEach((h, i) => headerCell(overdueSheet.getCell(1, i + 1), h));
  overdueSheet.getRow(1).height = 30;
  data.overdueInvoices.forEach((o, k) => {
    const row = k + 2;
    const vals: (string | number | Date | null)[] = [k + 1, o.employeeName, o.customerCode, o.customerName, o.invoiceNumber ?? "", o.dueDate, o.daysOverdue, o.remaining, DEBT_STATUS_LABEL[o.status]];
    vals.forEach((v, c) => {
      const cell = overdueSheet.getCell(row, c + 1);
      cell.value = v as ExcelJS.CellValue;
      cell.border = BOX_LIGHT;
      if (k % 2 === 1) cell.fill = solid(ZEBRA);
      if (c === 5) cell.numFmt = DATE_FMT;
      if (c === 7) cell.numFmt = VND_FMT;
    });
  });
  if (data.overdueInvoices.length > 0) {
    overdueSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.overdueInvoices.length + 1, column: odHeaders.length } };
  }
  overdueSheet.views = [{ state: "frozen", ySplit: 1 }];

  // ========== Sheet Kế hoạch thu ==========
  const nb = data.plan.bucketLabels.length;
  planSheet.getColumn(1).width = 20;
  for (let c = 2; c <= nb * 2 + 4; c++) planSheet.getColumn(c).width = 16;
  headerCell(planSheet.getCell(1, 1), "Nhân viên");
  planSheet.mergeCells(1, 1, 2, 1);
  data.plan.bucketLabels.forEach((label, i) => {
    planSheet.mergeCells(1, 2 + i * 2, 1, 3 + i * 2);
    headerCell(planSheet.getCell(1, 2 + i * 2), label);
    headerCell(planSheet.getCell(1, 3 + i * 2), label);
    headerCell(planSheet.getCell(2, 2 + i * 2), "Kế hoạch");
    headerCell(planSheet.getCell(2, 3 + i * 2), "Đã thu");
  });
  ["Tổng kế hoạch", "Tổng đã thu", "Tỉ lệ đạt (%)"].forEach((h, i) => {
    planSheet.mergeCells(1, 2 + nb * 2 + i, 2, 2 + nb * 2 + i);
    headerCell(planSheet.getCell(1, 2 + nb * 2 + i), h);
  });
  data.plan.rows.forEach((pr, k) => {
    const row = 3 + k;
    planSheet.getCell(row, 1).value = pr.employee;
    pr.planned.forEach((p, i) => {
      planSheet.getCell(row, 2 + i * 2).value = p;
      planSheet.getCell(row, 3 + i * 2).value = pr.collected[i];
      planSheet.getCell(row, 2 + i * 2).numFmt = VND_FMT;
      planSheet.getCell(row, 3 + i * 2).numFmt = VND_FMT;
    });
    const totalP = pr.planned.reduce((s, x) => s + x, 0);
    const totalC = pr.collected.reduce((s, x) => s + x, 0);
    const plannedCols = pr.planned.map((_, i) => `${colLetter(2 + i * 2)}${row}`).join(",");
    const collectedCols = pr.planned.map((_, i) => `${colLetter(3 + i * 2)}${row}`).join(",");
    planSheet.getCell(row, 2 + nb * 2).value = { formula: `SUM(${plannedCols})`, result: totalP };
    planSheet.getCell(row, 3 + nb * 2).value = { formula: `SUM(${collectedCols})`, result: totalC };
    planSheet.getCell(row, 4 + nb * 2).value = {
      formula: `IF(${colLetter(2 + nb * 2)}${row}=0,"",${colLetter(3 + nb * 2)}${row}/${colLetter(2 + nb * 2)}${row}*100)`,
      result: totalP > 0 ? (totalC / totalP) * 100 : "",
    };
    planSheet.getCell(row, 2 + nb * 2).numFmt = VND_FMT;
    planSheet.getCell(row, 3 + nb * 2).numFmt = VND_FMT;
    planSheet.getCell(row, 4 + nb * 2).numFmt = PCT_POINT_FMT;
    for (let c = 1; c <= nb * 2 + 4; c++) {
      planSheet.getCell(row, c).border = BOX_LIGHT;
      if (pr.employee === data.totalLabel) {
        planSheet.getCell(row, c).font = { bold: true, color: { argb: NAVY } };
        planSheet.getCell(row, c).fill = solid(TOTAL_FILL);
      } else if (k % 2 === 1) planSheet.getCell(row, c).fill = solid(ZEBRA);
    }
  });
  const received = data.totalLabel ? valueOf(data.totalLabel, "total_received", 0) : null;
  if (received !== null) {
    const row = 4 + data.plan.rows.length;
    planSheet.getCell(row, 1).value = "Tổng tiền về trong kỳ (cả công ty, kể cả khoản chưa khớp hoá đơn):";
    planSheet.getCell(row, 1).font = { bold: true };
    const c = planSheet.getCell(row, 6);
    c.value = received;
    c.numFmt = VND_FMT;
    c.font = { bold: true };
  }
  planSheet.views = [{ state: "frozen", ySplit: 2, xSplit: 1 }];

  // ========== Sheet Khách hàng mới ==========
  const ncHeaders = ["STT", "Ngày tạo", "Mã khách hàng", "Tên khách hàng", "NVKD phụ trách"];
  [6, 14, 18, 44, 22].forEach((w, i) => (newCusSheet.getColumn(i + 1).width = w));
  ncHeaders.forEach((h, i) => headerCell(newCusSheet.getCell(1, i + 1), h));
  data.newCustomers.forEach((c, k) => {
    const row = k + 2;
    // Ngày tạo hiển thị theo giờ VN: Excel đọc Date theo UTC nên cộng 7h trước khi ghi.
    const d = new Date(c.createdAt.getTime() + 7 * 3600_000);
    const vals: (string | number | Date)[] = [k + 1, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), c.customerCode, c.customerName, c.employee];
    vals.forEach((v, i) => {
      const cell = newCusSheet.getCell(row, i + 1);
      cell.value = v;
      cell.border = BOX_LIGHT;
      if (k % 2 === 1) cell.fill = solid(ZEBRA);
      if (i === 1) cell.numFmt = DATE_FMT;
    });
  });
  if (data.newCustomers.length > 0) {
    newCusSheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.newCustomers.length + 1, column: ncHeaders.length } };
  }
  newCusSheet.views = [{ state: "frozen", ySplit: 1 }];

  // ========== Sheet Cách tính ==========
  notesSheet.getColumn(1).width = 34;
  notesSheet.getColumn(2).width = 110;
  const notes: [string, string][] = [
    ["Doanh số đơn hàng", "Tổng G.Trị PO của các dòng PO có ngày đặt PO nằm trong kỳ (theo dõi PO)."],
    ["Doanh số đi hàng", "Tổng giá trị các đợt giao hàng thật có ngày giao nằm trong kỳ (file theo dõi PO + Phiếu đi hàng)."],
    ["Đơn hàng / Đi hàng sản xuất", "Như hai chỉ số trên nhưng chỉ tính dòng có mã hàng bắt đầu bằng SI hoặc SB. Dòng chưa có mã hàng không phân loại được nên không nằm trong số sản xuất."],
    ["OIH", "Giá trị còn lại của mọi PO đang mở (không giới hạn theo kỳ). Kỳ đã kết thúc: tính ngược về cuối kỳ (G.Trị PO trừ các đợt giao đến hết kỳ; PO đã đóng/huỷ không rõ ngày thì coi như đóng từ trước). Kỳ đang chạy: số tại lúc xuất file. Chỉ có cột kỳ hiện tại."],
    ["Chỉ tiêu / Hoàn thành (%)", "Chỉ có ở báo cáo tháng: chỉ tiêu doanh số tháng và Doanh số đi hàng ÷ chỉ tiêu."],
    ["Doanh số đi hàng so với KPI", "KPI = chỉ tiêu doanh số tháng (trang Kế hoạch kinh doanh). Báo cáo tháng: doanh số đi hàng cả tháng ÷ KPI tháng. Báo cáo tuần: luỹ kế doanh số đi hàng của tháng chứa ngày cuối tuần, tính tới hết tuần ÷ KPI cả tháng đó. Dòng Cả phòng = tổng các nhân viên bán hàng đang theo dõi. Hạng xếp theo % đạt giữa các nhân viên có KPI."],
    ["Khách hàng mới", "Số khách hàng được tạo trên trang Khách hàng trong kỳ, theo NVKD phụ trách (dòng Cả phòng gồm cả khách chưa gán NVKD)."],
    ["Công tác", "Số buổi = số ngày có buổi đi công tác đã được duyệt báo cáo (chính hoặc hỗ trợ); số khách = khách có kết quả \"Đã gặp\" trong các báo cáo đã duyệt. Báo cáo chờ duyệt và việc tiếp theo trễ hạn là số tại lúc xuất file."],
    ["Công nợ", `Chốt ${asOfText}. Quá hạn so với hạn thanh toán; nợ xấu = quá hạn trên 180 ngày. "Cả phòng" tính toàn bộ hoá đơn, kể cả hoá đơn chưa gán NVKD, nên có thể lớn hơn tổng các nhân viên. Nợ xấu của Logistic SC, Sữa TH, DP-Pulipha, Licogi được theo dõi riêng: có trong Nợ xấu nhưng không tính vào Quá hạn.`],
    ["Chưa có lịch thanh toán", "Hoá đơn còn nợ mà NVKD chưa điền ngày dự kiến thanh toán."],
    ["Kế hoạch thu", "Tổng giá trị hoá đơn có ngày dự kiến thanh toán nằm trong kỳ (theo tuần nếu là báo cáo tháng)."],
    ["Đã thu trong kỳ", "Tiền về đã khớp vào hoá đơn có ngày tiền về nằm trong kỳ (không phụ thuộc hoá đơn đó hẹn thu tuần nào)."],
    ["Tổng tiền về trong kỳ", "Mọi khoản tiền về trong kỳ của cả công ty, kể cả khoản chưa khớp hoá đơn (trừ khoản đã đánh dấu bỏ qua)."],
    ["% so kỳ trước", "(Kỳ này ÷ kỳ trước) − 1. Để trống nếu kỳ trước bằng 0 hoặc không có số."],
    ["Dòng Cả phòng", "Doanh số/đơn hàng/OIH = tổng các nhân viên bán hàng đang theo dõi (giống trang Tổng quan)."],
  ];
  headerCell(notesSheet.getCell(1, 1), "Chỉ số");
  headerCell(notesSheet.getCell(1, 2), "Cách tính");
  notes.forEach(([a, b], k) => {
    notesSheet.getCell(k + 2, 1).value = a;
    notesSheet.getCell(k + 2, 1).font = { bold: true, color: { argb: NAVY } };
    notesSheet.getCell(k + 2, 2).value = b;
    notesSheet.getCell(k + 2, 2).alignment = { wrapText: true, vertical: "top" };
    notesSheet.getCell(k + 2, 1).alignment = { vertical: "top" };
    for (const c of [1, 2]) {
      notesSheet.getCell(k + 2, c).border = BOX_LIGHT;
      if (k % 2 === 1) notesSheet.getCell(k + 2, c).fill = solid(ZEBRA);
    }
  });

  return { workbook: wb, charts };
}

/** Workbook chưa có biểu đồ (dùng cho test đọc số liệu). */
export async function buildReportWorkbook(data: ReportData): Promise<ExcelJS.Workbook> {
  return (await buildWorkbookAndCharts(data)).workbook;
}

/** File .xlsx hoàn chỉnh: workbook + biểu đồ gốc Excel chèn vào sheet Dashboard. */
export async function buildReportFile(data: ReportData): Promise<Buffer> {
  const { workbook, charts } = await buildWorkbookAndCharts(data);
  const raw = (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
  return injectCharts(raw, "Dashboard", charts);
}
