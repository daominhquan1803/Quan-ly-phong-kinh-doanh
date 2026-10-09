import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { prisma } from "@hoanggia/db";
import { requireSession, scopeByOwner, UnauthorizedError } from "@/lib/rbac";
import { embedLogo, addCompanyHeaderLines, NAVY, HEADER_FILL, THIN_BOX } from "@/lib/excel-brand";

export const dynamic = "force-dynamic";

const DATE_FMT = "dd/mm/yyyy";
const QTY_FMT = "#,##0.##";
const VN_OFFSET_MS = 7 * 3600_000;
const MAX_RANGE_DAYS = 366;

/** Ngày lưu dạng "0h giờ VN quy ra UTC" -> Date UTC 0h của đúng ngày VN, để Excel (đọc theo UTC)
 * hiện đúng ngày thay vì lùi 1 ngày. */
function vnCalendarDate(d: Date): Date {
  const t = new Date(d.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
}

function fmtDMY(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Xuất Excel thống kê đi hàng theo khoảng ngày (ngày phiếu đi hàng, từ A đến B, gồm cả 2 đầu) —
 * 1 dòng = 1 mã hàng của 1 phiếu. Sheet "Chi tiết" (lọc/sắp xếp được, có dòng tổng tự tính lại
 * theo bộ lọc) và sheet "Tổng hợp theo mã hàng". Phiếu không có ngày đi thì không vào thống kê. */
export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      return NextResponse.json({ error: "Thiếu hoặc sai định dạng ngày (từ ngày / đến ngày)" }, { status: 400 });
    }
    const start = new Date(`${from}T00:00:00+07:00`);
    const endExclusive = new Date(new Date(`${to}T00:00:00+07:00`).getTime() + 24 * 3600_000);
    if (Number.isNaN(start.getTime()) || Number.isNaN(endExclusive.getTime())) {
      return NextResponse.json({ error: "Ngày không hợp lệ" }, { status: 400 });
    }
    if (endExclusive <= start) {
      return NextResponse.json({ error: "Đến ngày phải sau hoặc bằng từ ngày" }, { status: 400 });
    }
    if ((endExclusive.getTime() - start.getTime()) / 86400_000 > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Khoảng ngày tối đa ${MAX_RANGE_DAYS} ngày` }, { status: 400 });
    }

    const slips = await prisma.shipmentSlip.findMany({
      where: { ...scopeByOwner(session, "createdById"), slipDate: { gte: start, lt: endExclusive } },
      orderBy: [{ slipDate: "asc" }, { slipNumber: "asc" }],
      select: {
        slipNumber: true,
        slipDate: true,
        customerName: true,
        order: { select: { orderCode: true } },
        items: {
          orderBy: { lineOrder: "asc" },
          select: { itemCode: true, itemName: true, unit: true, poSaleNumber: true, qtyActual: true, qtyRequested: true },
        },
      },
    });

    // Phẳng hoá: 1 dòng = 1 mã hàng của 1 phiếu. Số lượng = thực xuất, thiếu thì lấy số lượng yêu cầu.
    const lines = slips.flatMap((s) =>
      s.items.map((it) => ({
        slipNumber: s.slipNumber,
        date: vnCalendarDate(s.slipDate!),
        itemCode: it.itemCode ?? "",
        itemName: it.itemName,
        unit: it.unit ?? "",
        qty: Number(it.qtyActual ?? it.qtyRequested ?? 0),
        customer: s.customerName ?? "",
        po: it.poSaleNumber ?? s.order?.orderCode ?? "",
      }))
    );

    const workbook = new ExcelJS.Workbook();
    const rangeLabel = `Từ ${fmtDMY(from)} đến ${fmtDMY(to)}`;

    // ===== Sheet 1: Chi tiết =====
    const sheet = workbook.addWorksheet("Chi tiết", { views: [{ showGridLines: false }] });
    const COLS = [
      { header: "STT", width: 6 },
      { header: "Ngày đi", width: 12 },
      { header: "Số phiếu giao hàng", width: 20 },
      { header: "Mã hàng", width: 18 },
      { header: "Tên hàng", width: 44 },
      { header: "ĐVT", width: 8 },
      { header: "Số lượng", width: 12 },
      { header: "Khách hàng", width: 32 },
      { header: "Số PO", width: 18 },
    ];
    sheet.columns = COLS.map((c) => ({ width: c.width }));
    await embedLogo(workbook, sheet);
    let r = addCompanyHeaderLines(sheet, 1, 3, 7);
    r++;
    sheet.mergeCells(r, 1, r, COLS.length);
    sheet.getCell(r, 1).value = "THỐNG KÊ ĐI HÀNG";
    sheet.getCell(r, 1).font = { bold: true, size: 16, color: { argb: NAVY } };
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r++;
    sheet.mergeCells(r, 1, r, COLS.length);
    sheet.getCell(r, 1).value = `${rangeLabel} — ${slips.length} phiếu, ${lines.length} dòng hàng`;
    sheet.getCell(r, 1).font = { italic: true, color: { argb: "FF6B7280" } };
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r += 2;

    const headerRow = r;
    COLS.forEach((c, i) => {
      const cell = sheet.getCell(headerRow, i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = THIN_BOX;
    });
    sheet.getRow(headerRow).height = 24;

    lines.forEach((l, i) => {
      const row = headerRow + 1 + i;
      const values: (string | number | Date)[] = [i + 1, l.date, l.slipNumber, l.itemCode, l.itemName, l.unit, l.qty, l.customer, l.po];
      values.forEach((v, c) => {
        const cell = sheet.getCell(row, c + 1);
        cell.value = v;
        cell.border = THIN_BOX;
        if (c === 1) {
          cell.numFmt = DATE_FMT;
          cell.alignment = { horizontal: "center" };
        } else if (c === 6) {
          cell.numFmt = QTY_FMT;
        } else if (c === 0 || c === 5) {
          cell.alignment = { horizontal: "center" };
        }
      });
    });

    const lastDataRow = headerRow + lines.length;
    // Dòng tổng dùng SUBTOTAL(109) nên tự tính lại theo bộ lọc đang bật (lọc 1 mã hàng -> thấy tổng mã đó).
    const totalRow = lastDataRow + 1;
    sheet.mergeCells(totalRow, 1, totalRow, 6);
    sheet.getCell(totalRow, 1).value = "TỔNG (theo bộ lọc đang chọn)";
    sheet.getCell(totalRow, 1).alignment = { horizontal: "right" };
    sheet.getCell(totalRow, 7).value = {
      formula: `SUBTOTAL(109,G${headerRow + 1}:G${Math.max(lastDataRow, headerRow + 1)})`,
      result: lines.reduce((s, l) => s + l.qty, 0),
    };
    sheet.getCell(totalRow, 7).numFmt = QTY_FMT;
    for (let c = 1; c <= COLS.length; c++) {
      const cell = sheet.getCell(totalRow, c);
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.border = THIN_BOX;
    }
    if (lines.length > 0) sheet.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: lastDataRow, column: COLS.length } };
    sheet.views = [{ showGridLines: false, state: "frozen", ySplit: headerRow, xSplit: 0 }];
    sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${headerRow}:${headerRow}` };

    // ===== Sheet 2: Tổng hợp theo mã hàng =====
    const sum = workbook.addWorksheet("Tổng hợp theo mã hàng", { views: [{ showGridLines: false }] });
    const SUM_COLS = [
      { header: "STT", width: 6 },
      { header: "Mã hàng", width: 18 },
      { header: "Tên hàng", width: 44 },
      { header: "ĐVT", width: 8 },
      { header: "Số phiếu", width: 11 },
      { header: "Tổng số lượng", width: 15 },
    ];
    sum.columns = SUM_COLS.map((c) => ({ width: c.width }));
    sum.mergeCells(1, 1, 1, SUM_COLS.length);
    sum.getCell(1, 1).value = `TỔNG HỢP ĐI HÀNG THEO MÃ HÀNG — ${rangeLabel}`;
    sum.getCell(1, 1).font = { bold: true, size: 14, color: { argb: NAVY } };
    sum.getCell(1, 1).alignment = { horizontal: "center" };
    // Gộp theo mã hàng + ĐVT (cùng mã khác ĐVT không cộng lẫn); hàng không có mã thì gộp theo tên.
    const groups = new Map<string, { code: string; name: string; unit: string; slips: Set<string>; qty: number }>();
    for (const l of lines) {
      const key = `${l.itemCode || l.itemName}|${l.unit}`;
      const g = groups.get(key) ?? { code: l.itemCode, name: l.itemName, unit: l.unit, slips: new Set<string>(), qty: 0 };
      g.slips.add(l.slipNumber);
      g.qty += l.qty;
      groups.set(key, g);
    }
    const sumHeaderRow = 3;
    SUM_COLS.forEach((c, i) => {
      const cell = sum.getCell(sumHeaderRow, i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: NAVY } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = THIN_BOX;
    });
    const sorted = Array.from(groups.values()).sort((a, b) => (a.code || a.name).localeCompare(b.code || b.name, "vi"));
    sorted.forEach((g, i) => {
      const row = sumHeaderRow + 1 + i;
      const values: (string | number)[] = [i + 1, g.code, g.name, g.unit, g.slips.size, g.qty];
      values.forEach((v, c) => {
        const cell = sum.getCell(row, c + 1);
        cell.value = v;
        cell.border = THIN_BOX;
        if (c === 5) cell.numFmt = QTY_FMT;
        if (c === 0 || c === 3 || c === 4) cell.alignment = { horizontal: "center" };
      });
    });
    if (sorted.length > 0) {
      sum.autoFilter = { from: { row: sumHeaderRow, column: 1 }, to: { row: sumHeaderRow + sorted.length, column: SUM_COLS.length } };
    }
    sum.views = [{ showGridLines: false, state: "frozen", ySplit: sumHeaderRow, xSplit: 0 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `Thong-ke-di-hang_${from}_${to}.xlsx`;
    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error("shipment-slips export GET error", err);
    return NextResponse.json({ error: "Không xuất được file thống kê đi hàng" }, { status: 500 });
  }
}
