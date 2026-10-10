import ExcelJS from "exceljs";
import { embedLogo, addCompanyHeaderLines, NAVY, HEADER_FILL, THIN_BOX } from "@/lib/excel-brand";
import { DEBT_STATUS_LABEL } from "@/lib/debt-status";
import type { ReportData, ReportMetricDef } from "@/lib/report-metrics";

const VND_FMT = "#,##0";
const NUM_FMT = "#,##0.##";
const PCT_POINT_FMT = '0.0"%"'; // giá trị đã là "điểm phần trăm" (12.5 = 12,5%)
const CHANGE_FMT = "+0.0%;-0.0%;0.0%"; // % tăng giảm so kỳ trước (giá trị là phân số)
const DATE_FMT = "dd/mm/yyyy";
const GREEN = "FF15803D";
const RED = "FFC8102E";
const DATA = "Dữ liệu";

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

function headerCell(cell: ExcelJS.Cell, value: string) {
  cell.value = value;
  cell.font = { bold: true, color: { argb: NAVY } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.border = THIN_BOX;
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

/**
 * Dựng file Excel báo cáo tuần/tháng. Sheet "Dashboard" có 2 ô chọn (Nhân viên, Chỉ số) — mọi số trên
 * Dashboard là công thức SUMIFS lên sheet "Dữ liệu" nên đổi ô chọn là số đổi theo (Excel tự tính lại
 * khi mở, `fullCalcOnLoad`); kèm giá trị tính sẵn cho trình xem không chạy công thức.
 */
export async function buildReportWorkbook(data: ReportData): Promise<ExcelJS.Workbook> {
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
  const dash = wb.addWorksheet("Dashboard", { views: [{ showGridLines: false }] });
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
    for (let c = 1; c <= 9; c++) dataSheet.getCell(dr, c).border = THIN_BOX;
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
  [24, 40, 18, 18, 18, 13, 13, 3, 26, 18, 18, 18, 13, 13].forEach((w, i) => (dash.getColumn(i + 1).width = w));
  await embedLogo(wb, dash);
  let r = addCompanyHeaderLines(dash, 1, 3, 5);
  r++;
  dash.mergeCells(r, 1, r, 14);
  dash.getCell(r, 1).value = `BÁO CÁO ${typeLabel} — ${cur.label}`;
  dash.getCell(r, 1).font = { bold: true, size: 18, color: { argb: NAVY } };
  dash.getCell(r, 1).alignment = { horizontal: "center" };
  r++;
  dash.mergeCells(r, 1, r, 14);
  const asOfText = data.asOf ? `chốt cuối ngày ${data.asOf.toLocaleDateString("vi-VN")}` : "số hiện tại";
  dash.getCell(r, 1).value = `Xuất lúc ${data.generatedAt.toLocaleString("vi-VN")} — công nợ ${asOfText}. So sánh với 2 ${data.type === "month" ? "tháng" : "tuần"} trước.`;
  dash.getCell(r, 1).font = { italic: true, color: { argb: "FF6B7280" } };
  dash.getCell(r, 1).alignment = { horizontal: "center" };
  r += 2;

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
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    c.border = THIN_BOX;
    c.dataValidation = { type: "list", allowBlank: false, formulae: [list], showErrorMessage: true, errorTitle: "Chọn từ danh sách", error: "Hãy chọn một giá trị trong danh sách." };
  }
  dash.getCell(selEmpRow, 4).value = "← bấm ô vàng để chọn từ danh sách";
  dash.getCell(selEmpRow, 4).font = { italic: true, color: { argb: "FF6B7280" } };
  const EMP = `$B$${selEmpRow}`;
  const MET = `$B$${selMetricRow}`;
  r = selMetricRow + 2;

  // --- Bảng 1: tất cả chỉ số của nhân viên đã chọn ---
  const t1Title = r;
  dash.mergeCells(t1Title, 1, t1Title, 7);
  dash.getCell(t1Title, 1).value = { formula: `"TẤT CẢ CHỈ SỐ — "&${EMP}`, result: `TẤT CẢ CHỈ SỐ — ${defaultEmployee}` };
  dash.getCell(t1Title, 1).font = { bold: true, size: 13, color: { argb: NAVY } };
  const t1Head = r + 1;
  ["Nhóm", "Chỉ số", `${cur.label}`, `${periods[1].label}`, `${periods[2].label}`, "% so kỳ -1", "% so kỳ -2"].forEach((h, i) => headerCell(dash.getCell(t1Head, i + 1), h));
  dash.getRow(t1Head).height = 26;
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
    }
    for (let c = 1; c <= 7; c++) {
      const cell = dash.getCell(row, c);
      cell.border = THIN_BOX;
      if (c <= 2) cell.alignment = { horizontal: "left" };
    }
  });
  const t1Last = t1Head + metrics.length;
  changeRules(dash, `F${t1Head + 1}:G${t1Last}`);

  // --- Bảng 2: xếp hạng nhân viên theo chỉ số đã chọn ---
  dash.mergeCells(t1Title, 9, t1Title, 14);
  dash.getCell(t1Title, 9).value = { formula: `"XẾP HẠNG — "&${MET}`, result: `XẾP HẠNG — ${defaultMetric.label}` };
  dash.getCell(t1Title, 9).font = { bold: true, size: 13, color: { argb: NAVY } };
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
    }
    for (let c = 9; c <= 14; c++) dash.getCell(row, c).border = THIN_BOX;
    if (name === data.totalLabel) for (let c = 9; c <= 14; c++) dash.getCell(row, c).font = { bold: true };
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
  dash.getCell(Math.max(t1Last, t2Last) + 2, 1).font = { italic: true, color: { argb: "FF6B7280" } };
  dash.views = [{ showGridLines: false, state: "frozen", ySplit: selMetricRow }];

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
      debtSheet.getCell(k + 2, c).border = THIN_BOX;
      if (name === data.totalLabel) debtSheet.getCell(k + 2, c).font = { bold: true };
    }
  });
  debtSheet.getCell(employeeOptions.length + 3, 1).value = `Công nợ ${asOfText}.`;
  debtSheet.getCell(employeeOptions.length + 3, 1).font = { italic: true, color: { argb: "FF6B7280" } };
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
      cell.border = THIN_BOX;
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
      planSheet.getCell(row, c).border = THIN_BOX;
      if (pr.employee === data.totalLabel) planSheet.getCell(row, c).font = { bold: true };
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
      cell.border = THIN_BOX;
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
    ["OIH", "Giá trị còn lại của mọi PO đang mở (không giới hạn theo kỳ). Là số tại lúc xuất file, không tính ngược về quá khứ được nên không có cột so sánh."],
    ["Chỉ tiêu / Hoàn thành (%)", "Chỉ có ở báo cáo tháng: chỉ tiêu doanh số tháng và Doanh số đi hàng ÷ chỉ tiêu."],
    ["Khách hàng mới", "Số khách hàng được tạo trên trang Khách hàng trong kỳ, theo NVKD phụ trách (dòng Cả phòng gồm cả khách chưa gán NVKD)."],
    ["Công nợ", `Chốt ${asOfText}. Quá hạn so với hạn thanh toán; nợ xấu = quá hạn trên 180 ngày. "Cả phòng" tính toàn bộ hoá đơn, kể cả hoá đơn chưa gán NVKD, nên có thể lớn hơn tổng các nhân viên.`],
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
    notesSheet.getCell(k + 2, 1).font = { bold: true };
    notesSheet.getCell(k + 2, 2).value = b;
    notesSheet.getCell(k + 2, 2).alignment = { wrapText: true, vertical: "top" };
    notesSheet.getCell(k + 2, 1).alignment = { vertical: "top" };
  });

  return wb;
}
