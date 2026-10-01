import ExcelJS from "exceljs";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";

export const COMPANY_NAME = "CÔNG TY CỔ PHẦN GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
export const COMPANY_ADDRESS = "Số 44/215 Định Công Thượng, Định Công, Hoàng Mai, HN";
export const COMPANY_EMAIL = "kinhdoanh@hoanggiaps.com";
export const COMPANY_WEBSITE = "www.hoanggiaps.com";
export const NAVY = "FF0B2447";
export const RED = "FFC8102E";
export const HEADER_FILL = "FFE9EEF7";
export const BORDER: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF9AA5B1" } };
export const THIN_BOX: Partial<ExcelJS.Borders> = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

/** Nhúng logo (rasterize SVG -> PNG, Excel không nhúng được ảnh vector) ở góc trên-trái — dùng
 * chung cho mọi file Excel xuất ra, xem apps/web/src/app/api/picking-slips/[id]/export/route.ts
 * (bản gốc trước khi tách ra đây). */
export async function embedLogo(workbook: ExcelJS.Workbook, sheet: ExcelJS.Worksheet) {
  try {
    const svgPath = path.join(process.cwd(), "public", "logo", "mark.svg");
    const svgBuffer = await readFile(svgPath);
    const pngBuffer = await sharp(svgBuffer).resize({ height: 240 }).png().toBuffer();
    const imageId = workbook.addImage({ buffer: pngBuffer as unknown as ExcelJS.Buffer, extension: "png" });
    sheet.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 132, height: 60 } });
  } catch (imgErr) {
    console.error("excel export: không nhúng được logo", imgErr);
  }
}

/** 4 dòng tên/địa chỉ/email/website công ty, bắt đầu từ dòng `startRow` cột `startCol` (merge
 * ngang `mergeCols` cột) — trả về dòng tiếp theo còn trống. */
export function addCompanyHeaderLines(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  startCol: number,
  mergeCols: number
): number {
  let r = startRow;
  const endCol = startCol + mergeCols - 1;
  sheet.mergeCells(r, startCol, r, endCol);
  sheet.getCell(r, startCol).value = COMPANY_NAME;
  sheet.getCell(r, startCol).font = { bold: true, size: 14, color: { argb: NAVY } };
  r++;
  sheet.mergeCells(r, startCol, r, endCol);
  sheet.getCell(r, startCol).value = `Địa chỉ: ${COMPANY_ADDRESS}`;
  r++;
  sheet.mergeCells(r, startCol, r, endCol);
  sheet.getCell(r, startCol).value = `Email: ${COMPANY_EMAIL}`;
  r++;
  sheet.mergeCells(r, startCol, r, endCol);
  sheet.getCell(r, startCol).value = `Website: ${COMPANY_WEBSITE}`;
  return r + 1;
}
