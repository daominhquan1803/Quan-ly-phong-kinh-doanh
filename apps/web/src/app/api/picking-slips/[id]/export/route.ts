import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@hoanggia/db";
import { requireAdmin, UnauthorizedError, ForbiddenError } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const COMPANY_NAME = "CÔNG TY CỔ PHẦN GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
const COMPANY_ADDRESS = "Số 44/215 Định Công Thượng, Định Công, Hoàng Mai, HN";
const COMPANY_EMAIL = "kinhdoanh@hoanggiaps.com";
const COMPANY_WEBSITE = "www.hoanggiaps.com";
const NAVY = "FF0B2447";
const RED = "FFC8102E";
const HEADER_FILL = "FFE9EEF7";
const BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF9AA5B1" } };
const THIN_BOX: Partial<ExcelJS.Borders> = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

function qty(n: unknown): number {
  return n == null ? 0 : Number(n);
}

/** Xuất Phiếu soạn hàng ra file Excel có định dạng đầy đủ (logo, màu, viền, gộp ô) — bố cục
 * theo đúng file mẫu anh Quân gửi, thay cho bản chữ đơn thuần trước đây (thư viện xlsx cũ không
 * hỗ trợ định dạng/nhúng ảnh ở bản miễn phí, nên đổi sang exceljs). */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await requireAdmin();
    const slip = await prisma.pickingSlip.findUnique({
      where: { id: params.id },
      include: { items: { orderBy: { lineOrder: "asc" } } },
    });
    if (!slip) return NextResponse.json({ error: "Không tìm thấy Phiếu soạn hàng" }, { status: 404 });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Phiếu soạn hàng", { views: [{ showGridLines: false }] });
    sheet.columns = [
      { width: 6 }, // A STT
      { width: 14 }, // B Mã hàng
      { width: 42 }, // C Tên hàng
      { width: 16 }, // D Số PO
      { width: 8 }, // E Đvt
      { width: 16 }, // F SL còn lại chưa giao
      { width: 14 }, // G SL cần soạn
      { width: 18 }, // H Mã Hàng/Số PO-KH
      { width: 14 }, // I Ngày cần giao
    ];

    // ---- Logo (rasterize SVG -> PNG vì Excel không nhúng được ảnh vector) ----
    try {
      const svgPath = path.join(process.cwd(), "public", "logo", "mark.svg");
      const svgBuffer = await readFile(svgPath);
      const pngBuffer = await sharp(svgBuffer).resize({ height: 240 }).png().toBuffer();
      const imageId = workbook.addImage({ buffer: pngBuffer as unknown as ExcelJS.Buffer, extension: "png" });
      sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 132, height: 60 } });
    } catch (imgErr) {
      console.error("picking-slips export: không nhúng được logo", imgErr);
    }

    let r = 1;
    sheet.getRow(r).height = 20;
    r = 4;
    sheet.mergeCells(r, 3, r, 9);
    sheet.getCell(r, 3).value = COMPANY_NAME;
    sheet.getCell(r, 3).font = { bold: true, size: 14, color: { argb: NAVY } };
    r++;
    sheet.mergeCells(r, 3, r, 9);
    sheet.getCell(r, 3).value = `Địa chỉ: ${COMPANY_ADDRESS}`;
    r++;
    sheet.mergeCells(r, 3, r, 9);
    sheet.getCell(r, 3).value = `Email: ${COMPANY_EMAIL}`;
    r++;
    sheet.mergeCells(r, 3, r, 9);
    sheet.getCell(r, 3).value = `Website: ${COMPANY_WEBSITE}`;
    r += 2;

    sheet.mergeCells(r, 1, r, 9);
    const contactLine = `Phụ trách đơn hàng: ${slip.salesEmployeeNameSnapshot ?? "—"}${
      slip.salesEmployeePhoneSnapshot ? "_" + slip.salesEmployeePhoneSnapshot : ""
    }`;
    sheet.getCell(r, 1).value = contactLine;
    sheet.getCell(r, 1).font = { bold: true, size: 11 };
    r += 2;

    sheet.mergeCells(r, 1, r, 9);
    sheet.getCell(r, 1).value = "PHIẾU SOẠN HÀNG";
    sheet.getCell(r, 1).font = { bold: true, size: 18, color: { argb: NAVY } };
    sheet.getCell(r, 1).alignment = { horizontal: "center" };
    r += 2;

    const d = slip.slipDate;
    sheet.mergeCells(r, 1, r, 4);
    sheet.getCell(r, 1).value = `Số phiếu: ${slip.slipNumber}`;
    sheet.getCell(r, 1).font = { bold: true };
    sheet.mergeCells(r, 6, r, 9);
    sheet.getCell(r, 6).value = `Ngày ${d.getDate()} tháng ${d.getMonth() + 1} năm ${d.getFullYear()}`;
    sheet.getCell(r, 6).font = { bold: true };
    sheet.getCell(r, 6).alignment = { horizontal: "right" };
    r += 2;

    function infoRow(label: string, value: string) {
      sheet.getCell(r, 1).value = label;
      sheet.getCell(r, 1).font = { bold: true };
      sheet.mergeCells(r, 3, r, 9);
      sheet.getCell(r, 3).value = value;
      sheet.getCell(r, 3).font = { bold: true, color: { argb: NAVY } };
      r++;
    }
    infoRow("Khách hàng:", slip.customerName);
    if (slip.deliveryAddress) infoRow("Địa chỉ giao hàng:", slip.deliveryAddress);
    if (slip.contactPhone) infoRow("SĐT liên hệ:", slip.contactPhone);
    r++;

    // ---- Bảng dòng hàng — tiêu đề 2 dòng, cột "Số lượng" gộp ngang 2 cột con ----
    const headerRow1 = r;
    const headerRow2 = r + 1;
    const headerCells: [string, number, number][] = [
      ["STT", 1, 1],
      ["Mã hàng", 2, 2],
      ["Tên hàng", 3, 3],
      ["Số PO", 4, 4],
      ["Đvt", 5, 5],
      ["Mã Hàng/ Số PO-KH", 8, 8],
      ["Ngày cần giao", 9, 9],
    ];
    for (const [label, colStart] of headerCells) {
      sheet.mergeCells(headerRow1, colStart, headerRow2, colStart);
      sheet.getCell(headerRow1, colStart).value = label;
    }
    sheet.mergeCells(headerRow1, 6, headerRow1, 7);
    sheet.getCell(headerRow1, 6).value = "Số lượng";
    sheet.getCell(headerRow2, 6).value = "Còn lại chưa giao";
    sheet.getCell(headerRow2, 7).value = "Cần soạn";
    for (let c = 1; c <= 9; c++) {
      for (const row of [headerRow1, headerRow2]) {
        const cell = sheet.getCell(row, c);
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
        cell.border = THIN_BOX;
      }
    }
    r = headerRow2 + 1;

    for (const [i, it] of slip.items.entries()) {
      sheet.getCell(r, 1).value = i + 1;
      sheet.getCell(r, 2).value = it.itemCode ?? "";
      sheet.getCell(r, 3).value = it.itemName;
      sheet.getCell(r, 4).value = it.poCode;
      sheet.getCell(r, 5).value = it.unit ?? "";
      sheet.getCell(r, 6).value = qty(it.remainingQtySnapshot);
      sheet.getCell(r, 7).value = qty(it.qtyToPick);
      sheet.getCell(r, 8).value = it.customerItemCode ?? "";
      sheet.getCell(r, 9).value = it.deliveryDate
        ? `${String(it.deliveryDate.getDate()).padStart(2, "0")}/${String(it.deliveryDate.getMonth() + 1).padStart(2, "0")}/${it.deliveryDate.getFullYear()}`
        : "";
      sheet.getCell(r, 6).numFmt = "#,##0.00";
      sheet.getCell(r, 7).numFmt = "#,##0.00";
      sheet.getCell(r, 7).font = { bold: true, color: { argb: RED } };
      for (let c = 1; c <= 9; c++) {
        const cell = sheet.getCell(r, c);
        cell.border = THIN_BOX;
        cell.alignment = { vertical: "middle", wrapText: c === 3, horizontal: c === 1 || c === 5 ? "center" : c === 6 || c === 7 ? "right" : "left" };
      }
      r++;
    }
    r++;

    sheet.getCell(r, 1).value = "LƯU Ý:";
    sheet.getCell(r, 1).font = { bold: true };
    r++;
    sheet.mergeCells(r, 1, r, 9);
    sheet.getCell(r, 1).value = slip.note ?? "";
    sheet.getCell(r, 1).alignment = { wrapText: true };
    sheet.getRow(r).height = 48;

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${slip.slipNumber}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    console.error("picking-slips/[id]/export GET error", err);
    return NextResponse.json({ error: "Không xuất được file Excel" }, { status: 500 });
  }
}
