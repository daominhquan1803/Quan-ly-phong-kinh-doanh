import ExcelJS from "exceljs";
import { addCompanyHeaderLines, embedLogo, HEADER_FILL, NAVY, THIN_BOX } from "./excel-brand";
import { BUCKET_LABEL, HISTORY_MONTHS, PAY_STATUS_LABEL, STATS_FROM, vnParts, type DormantBucket } from "./stats";
import type { DormantCustomerView, DormantItemView, InvoiceRow } from "./stats-data";

const DATE_FMT = "dd/mm/yyyy";
const NUM_FMT = "#,##0.##";
const MONEY_FMT = "#,##0";

/** Ngày lưu "0h giờ VN quy ra UTC" -> Date UTC 0h của đúng ngày VN, để Excel (đọc theo UTC) hiện đúng ngày. */
function xlDate(d: Date | null): Date | null {
  if (!d) return null;
  const p = vnParts(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.d));
}
export function fmtDMY(d: Date): string {
  const p = vnParts(d);
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

type Cell = string | number | Date | null;
interface Col {
  header: string;
  width: number;
  fmt?: string;
  center?: boolean;
  wrap?: boolean;
  /** Cộng tổng cột này ở dòng cuối (SUBTOTAL — tự tính lại theo bộ lọc). */
  total?: boolean;
}

/** Dựng 1 sheet bảng: (logo + 4 dòng công ty ở sheet đầu) tiêu đề, dòng phụ, ghi chú, bảng có lọc + dòng tổng. */
async function addTableSheet(
  wb: ExcelJS.Workbook,
  opts: { name: string; title: string; subtitle: string; notes?: string[]; cols: Col[]; rows: Cell[][]; withLogo?: boolean }
): Promise<ExcelJS.Worksheet> {
  const sheet = wb.addWorksheet(opts.name, { views: [{ showGridLines: false }] });
  const n = opts.cols.length;
  sheet.columns = opts.cols.map((c) => ({ width: c.width }));
  let r = 1;
  if (opts.withLogo) {
    await embedLogo(wb, sheet);
    r = addCompanyHeaderLines(sheet, 1, 3, Math.max(4, n - 2)) + 1;
  }
  sheet.mergeCells(r, 1, r, n);
  sheet.getCell(r, 1).value = opts.title;
  sheet.getCell(r, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
  sheet.getCell(r, 1).alignment = { horizontal: "center" };
  r++;
  sheet.mergeCells(r, 1, r, n);
  sheet.getCell(r, 1).value = opts.subtitle;
  sheet.getCell(r, 1).font = { italic: true, color: { argb: "FF6B7280" } };
  sheet.getCell(r, 1).alignment = { horizontal: "center", wrapText: true };
  r++;
  for (const note of opts.notes ?? []) {
    sheet.mergeCells(r, 1, r, n);
    sheet.getCell(r, 1).value = note;
    sheet.getCell(r, 1).font = { size: 10, color: { argb: "FF6B7280" } };
    sheet.getCell(r, 1).alignment = { wrapText: true, vertical: "top" };
    r++;
  }
  r++;

  const headerRow = r;
  opts.cols.forEach((c, i) => {
    const cell = sheet.getCell(headerRow, i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = THIN_BOX;
  });
  sheet.getRow(headerRow).height = 30;

  opts.rows.forEach((row, ri) => {
    const rr = headerRow + 1 + ri;
    row.forEach((v, ci) => {
      const col = opts.cols[ci];
      const cell = sheet.getCell(rr, ci + 1);
      cell.value = v;
      cell.border = THIN_BOX;
      if (col.fmt) cell.numFmt = col.fmt;
      if (col.center) cell.alignment = { horizontal: "center" };
      else if (col.wrap) cell.alignment = { wrapText: true, vertical: "top" };
    });
  });

  const last = headerRow + opts.rows.length;
  const totalRow = last + 1;
  sheet.getCell(totalRow, 1).value = "TỔNG (theo bộ lọc đang chọn)";
  opts.cols.forEach((c, i) => {
    const cell = sheet.getCell(totalRow, i + 1);
    cell.font = { bold: true, color: { argb: NAVY } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.border = THIN_BOX;
    if (c.total) {
      const letter = sheet.getColumn(i + 1).letter;
      cell.value = {
        formula: `SUBTOTAL(109,${letter}${headerRow + 1}:${letter}${Math.max(last, headerRow + 1)})`,
        result: opts.rows.reduce((s, row) => s + (typeof row[i] === "number" ? (row[i] as number) : 0), 0),
      };
      cell.numFmt = c.fmt ?? NUM_FMT;
    }
  });
  if (opts.rows.length > 0) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: last, column: n } };
  sheet.views = [{ showGridLines: false, state: "frozen", ySplit: headerRow, xSplit: 0 }];
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}` };
  return sheet;
}

const refNote = (ref: Date) =>
  `Tính đến ngày ${fmtDMY(ref)}. Chỉ tính PO từ ${fmtDMY(STATS_FROM)} theo ngày PO; doanh số = G.Trị PO. Lịch sử = ${HISTORY_MONTHS} tháng tính lùi từ ngày PO cuối (không sớm hơn ${fmtDMY(STATS_FROM)}).`;

function customerNote(c: { inDirectory: boolean; truncated: boolean }): string {
  return [c.inDirectory ? "" : "Chưa có trong danh sách Khách hàng", c.truncated ? `Lịch sử từ ${fmtDMY(STATS_FROM)} (chưa đủ ${HISTORY_MONTHS} tháng)` : ""]
    .filter(Boolean)
    .join("; ");
}

export async function buildDormantCustomersWorkbook(rows: DormantCustomerView[], bucket: DormantBucket, ref: Date): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await addTableSheet(wb, {
    name: "Tổng quan",
    title: "KHÁCH HÀNG LÂU CHƯA MUA HÀNG",
    subtitle: `${BUCKET_LABEL[bucket]} — ${rows.length} khách`,
    notes: [refNote(ref)],
    withLogo: true,
    cols: [
      { header: "STT", width: 6, center: true },
      { header: "Mã khách", width: 20 },
      { header: "Tên khách hàng", width: 46 },
      { header: "NVKD phụ trách", width: 20 },
      { header: "Ngày PO cuối", width: 13, fmt: DATE_FMT, center: true },
      { header: "Số ngày chưa mua", width: 12, fmt: "#,##0", center: true },
      { header: "Số tháng chưa mua", width: 12, center: true },
      { header: `Số PO (${HISTORY_MONTHS} tháng)`, width: 11, fmt: "#,##0", center: true, total: true },
      { header: `Số mã hàng (${HISTORY_MONTHS} tháng)`, width: 12, fmt: "#,##0", center: true },
      { header: `Doanh số ${HISTORY_MONTHS} tháng (G.Trị PO)`, width: 20, fmt: MONEY_FMT, total: true },
      { header: "Ghi chú", width: 44, wrap: true },
    ],
    rows: rows.map((c, i) => [i + 1, c.code, c.name, c.ownerName, xlDate(c.lastPoDate), c.daysSince, c.monthsSince, c.poCount, c.itemCount, c.historyValue, customerNote(c)]),
  });
  const lines = rows.flatMap((c) => c.history.map((h) => ({ c, h })));
  await addTableSheet(wb, {
    name: `Lịch sử ${HISTORY_MONTHS} tháng`,
    title: "LỊCH SỬ MUA HÀNG GẦN NHẤT",
    subtitle: `${BUCKET_LABEL[bucket]} — ${HISTORY_MONTHS} tháng tính lùi từ ngày PO cuối của từng khách`,
    cols: [
      { header: "STT", width: 6, center: true },
      { header: "Mã khách", width: 20 },
      { header: "Tên khách hàng", width: 40 },
      { header: "NVKD", width: 18 },
      { header: "Ngày PO", width: 12, fmt: DATE_FMT, center: true },
      { header: "Số PO", width: 18 },
      { header: "Mã hàng", width: 16 },
      { header: "Tên hàng", width: 44, wrap: true },
      { header: "ĐVT", width: 8, center: true },
      { header: "Số lượng", width: 13, fmt: NUM_FMT, total: true },
      { header: "Doanh số (G.Trị PO)", width: 18, fmt: MONEY_FMT, total: true },
    ],
    rows: lines.map(({ c, h }, i) => [i + 1, c.code, c.name, c.ownerName, xlDate(h.poDate), h.poCode, h.itemCode, h.itemName, h.unit, h.qty, h.value]),
  });
  return wb;
}

export async function buildDormantItemsWorkbook(rows: DormantItemView[], bucket: DormantBucket, ref: Date): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await addTableSheet(wb, {
    name: "Tổng quan",
    title: "MÃ HÀNG LÂU CHƯA MUA THEO KHÁCH HÀNG",
    subtitle: `${BUCKET_LABEL[bucket]} — ${rows.length} cặp (khách, mã hàng)`,
    notes: [refNote(ref), "Mốc tính theo lần mua cuối của CHÍNH mã hàng đó của khách đó. Dòng PO không có mã hàng không được tính."],
    withLogo: true,
    cols: [
      { header: "STT", width: 6, center: true },
      { header: "Mã khách", width: 20 },
      { header: "Tên khách hàng", width: 40 },
      { header: "NVKD", width: 18 },
      { header: "Mã hàng", width: 16 },
      { header: "Tên hàng", width: 44, wrap: true },
      { header: "Ngày mua cuối", width: 13, fmt: DATE_FMT, center: true },
      { header: "Số ngày chưa mua", width: 12, fmt: "#,##0", center: true },
      { header: "Số tháng chưa mua", width: 12, center: true },
      { header: "Số PO", width: 9, center: true, total: true },
      { header: `Số lượng ${HISTORY_MONTHS} tháng`, width: 14, fmt: NUM_FMT, total: true },
      { header: `Doanh số ${HISTORY_MONTHS} tháng (G.Trị PO)`, width: 20, fmt: MONEY_FMT, total: true },
      { header: "Ghi chú", width: 40, wrap: true },
    ],
    rows: rows.map((r, i) => [i + 1, r.code, r.name, r.ownerName, r.itemCode, r.itemName, xlDate(r.lastPoDate), r.daysSince, r.monthsSince, r.poCount, r.historyQty, r.historyValue, customerNote(r)]),
  });
  const lines = rows.flatMap((r) => r.history.map((h) => ({ r, h })));
  await addTableSheet(wb, {
    name: `Lịch sử ${HISTORY_MONTHS} tháng`,
    title: "LỊCH SỬ MUA CỦA TỪNG MÃ HÀNG",
    subtitle: `${BUCKET_LABEL[bucket]} — ${HISTORY_MONTHS} tháng tính lùi từ lần mua cuối của mã hàng đó`,
    cols: [
      { header: "STT", width: 6, center: true },
      { header: "Mã khách", width: 20 },
      { header: "Tên khách hàng", width: 40 },
      { header: "NVKD", width: 18 },
      { header: "Mã hàng", width: 16 },
      { header: "Tên hàng", width: 44, wrap: true },
      { header: "Ngày PO", width: 12, fmt: DATE_FMT, center: true },
      { header: "Số PO", width: 18 },
      { header: "ĐVT", width: 8, center: true },
      { header: "Số lượng", width: 13, fmt: NUM_FMT, total: true },
      { header: "Doanh số (G.Trị PO)", width: 18, fmt: MONEY_FMT, total: true },
    ],
    rows: lines.map(({ r, h }, i) => [i + 1, r.code, r.name, r.ownerName, r.itemCode, r.itemName, xlDate(h.poDate), h.poCode, h.unit, h.qty, h.value]),
  });
  return wb;
}

export async function buildInvoiceWorkbook(rows: InvoiceRow[], customerLabel: string, monthLabel: string, ref: Date): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const count = (s: keyof typeof PAY_STATUS_LABEL) => rows.filter((r) => r.status === s).length;
  const sum = (f: (r: InvoiceRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n));
  await addTableSheet(wb, {
    name: "Hoá đơn",
    title: "THỐNG KÊ HOÁ ĐƠN THEO KHÁCH HÀNG",
    subtitle: `${customerLabel} — ${monthLabel} — ${rows.length} hoá đơn`,
    notes: [
      `Đã thanh toán ${count("PAID")} · Thanh toán một phần ${count("PARTIAL")} · Chưa thanh toán ${count("UNPAID")}. Tổng ${fmt(sum((r) => r.total))} đ, đã thu ${fmt(sum((r) => r.paid))} đ, còn lại ${fmt(sum((r) => r.remaining))} đ (tính đến ${fmtDMY(ref)}).`,
      "Dữ liệu lấy từ mục Công nợ; hoá đơn đã thanh toán xong từ trước khi nhập hệ thống công nợ có thể không có trong danh sách.",
    ],
    withLogo: true,
    cols: [
      { header: "STT", width: 6, center: true },
      { header: "Số hoá đơn", width: 16 },
      { header: "Ngày hoá đơn", width: 13, fmt: DATE_FMT, center: true },
      { header: "Hạn thanh toán", width: 13, fmt: DATE_FMT, center: true },
      { header: "Mã khách", width: 20 },
      { header: "Tên khách hàng", width: 40 },
      { header: "NVKD", width: 18 },
      { header: "Tổng số tiền", width: 16, fmt: MONEY_FMT, total: true },
      { header: "Đã thanh toán", width: 16, fmt: MONEY_FMT, total: true },
      { header: "Còn lại", width: 16, fmt: MONEY_FMT, total: true },
      { header: "Trạng thái", width: 20, center: true },
      { header: "Ngày thanh toán gần nhất", width: 14, fmt: DATE_FMT, center: true },
    ],
    rows: rows.map((r, i) => [i + 1, r.invoiceNumber, xlDate(r.invoiceDate), xlDate(r.dueDate), r.customerCode, r.customerName, r.ownerName, r.total, r.paid, r.remaining, PAY_STATUS_LABEL[r.status], xlDate(r.lastPaymentDate)]),
  });

  const byCustomer = new Map<string, { code: string; name: string; n: number; total: number; paid: number; remaining: number; unpaid: number }>();
  for (const r of rows) {
    const k = r.customerCode.toUpperCase();
    const c = byCustomer.get(k) ?? { code: r.customerCode, name: r.customerName, n: 0, total: 0, paid: 0, remaining: 0, unpaid: 0 };
    c.n++;
    c.total += r.total;
    c.paid += r.paid;
    c.remaining += r.remaining;
    if (r.status !== "PAID") c.unpaid++;
    byCustomer.set(k, c);
  }
  if (byCustomer.size > 1) {
    await addTableSheet(wb, {
      name: "Tổng hợp theo khách",
      title: "TỔNG HỢP HOÁ ĐƠN THEO KHÁCH HÀNG",
      subtitle: `${monthLabel} — ${byCustomer.size} khách`,
      cols: [
        { header: "STT", width: 6, center: true },
        { header: "Mã khách", width: 22 },
        { header: "Tên khách hàng", width: 46 },
        { header: "Số hoá đơn", width: 12, center: true, total: true },
        { header: "Chưa thanh toán xong", width: 14, center: true, total: true },
        { header: "Tổng số tiền", width: 17, fmt: MONEY_FMT, total: true },
        { header: "Đã thanh toán", width: 17, fmt: MONEY_FMT, total: true },
        { header: "Còn lại", width: 17, fmt: MONEY_FMT, total: true },
      ],
      rows: Array.from(byCustomer.values())
        .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, "vi"))
        .map((c, i) => [i + 1, c.code, c.name, c.n, c.unpaid, c.total, c.paid, c.remaining]),
    });
  }
  return wb;
}
