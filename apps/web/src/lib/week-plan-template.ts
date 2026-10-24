import ExcelJS from "exceljs";
import { BORDER, HEADER_FILL, NAVY } from "./excel-brand";
import { IMPORT_COLUMNS, METRIC_IMPORT_LABEL, NATIONALITIES, SCALE_KEYS, SCALE_LABEL } from "./week-plan-entry";

const ROWS = 300;
/** Cột bắt buộc đủ thì dòng mới được tính (từ 26/10/2026) — tô tiêu đề cam để NVKD nhận ra. */
const REQUIRED = new Set(["customer", "address", "nationality", "scale", "contactName", "contactPhone", "need", "workDone", "nextAction", "nextActionAt"]);

const list = (items: readonly string[]) => ({ type: "list" as const, allowBlank: true, formulae: [`"${items.join(",")}"`], showErrorMessage: true, errorTitle: "Chọn trong danh sách", error: "Hãy chọn một giá trị trong danh sách có sẵn." });

/** File Excel mẫu nhập "KẾT QUẢ" Kế hoạch tuần — sheet "KẾT QUẢ" khớp đúng bộ đọc ở /api/week-plan/results/import. */
export async function buildWeekPlanTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hoàng Gia CRM";
  const ws = wb.addWorksheet("KẾT QUẢ", { views: [{ state: "frozen", ySplit: 1, xSplit: 3 }] });

  type Key = Exclude<keyof typeof IMPORT_COLUMNS, "contactInfo">; // "contactInfo" chỉ để đọc file cũ, không có trong mẫu
  const keys = (Object.keys(IMPORT_COLUMNS) as (keyof typeof IMPORT_COLUMNS)[]).filter((k): k is Key => k !== "contactInfo");
  ws.columns = keys.map((k) => ({ header: IMPORT_COLUMNS[k].header, key: k, width: IMPORT_COLUMNS[k].width }));
  const head = ws.getRow(1);
  head.height = 34;
  head.eachCell((c, col) => {
    const required = REQUIRED.has(keys[col - 1]);
    c.font = { bold: true, color: { argb: required ? "FF7A3E00" : NAVY } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: required ? "FFFFE0B2" : HEADER_FILL } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };
  });

  const col = (k: Key) => keys.indexOf(k) + 1;
  for (let r = 2; r <= ROWS + 1; r++) {
    ws.getCell(r, col("metric")).dataValidation = list(Object.values(METRIC_IMPORT_LABEL));
    ws.getCell(r, col("nationality")).dataValidation = list(NATIONALITIES);
    ws.getCell(r, col("scale")).dataValidation = list(SCALE_KEYS.map((k) => SCALE_LABEL[k]));
    for (const k of ["date", "nextActionAt"] as const) {
      const c = ws.getCell(r, col(k));
      c.numFmt = "dd/mm/yyyy";
      c.dataValidation = { type: "date", operator: "greaterThan", formulae: [new Date(Date.UTC(2020, 0, 1))], allowBlank: true, showErrorMessage: true, errorTitle: "Sai ngày", error: "Nhập ngày dạng dd/mm/yyyy, ví dụ 27/10/2026." };
    }
    ws.getCell(r, col("contactPhone")).numFmt = "@";
  }

  const guide = wb.addWorksheet("HƯỚNG DẪN");
  guide.getColumn(1).width = 110;
  const lines = [
    "HƯỚNG DẪN NHẬP KẾT QUẢ KẾ HOẠCH TUẦN BẰNG EXCEL",
    "",
    "1. Điền vào sheet \"KẾT QUẢ\", mỗi khách một dòng. Không đổi tên sheet, không đổi tên cột, không chèn cột.",
    "2. Cột \"Mục\": chọn \"Khách hàng mới liên hệ\" hoặc \"Khách hàng mới hẹn gặp được\". Dòng trống ở cột Mục lấy theo dòng gần nhất phía trên.",
    "3. Các cột tiêu đề màu cam là BẮT BUỘC. Từ 26/10/2026, dòng thiếu bất kỳ cột cam nào vẫn được nhập nhưng CHƯA được tính vào kế hoạch tuần;",
    "   xem cột \"Tính\" trên app để biết còn thiếu gì và bổ sung.",
    "4. Ngày tháng và Ngày hẹn nhắc nhập dạng dd/mm/yyyy. Ngày hẹn nhắc phải từ ngày ghi nhận trở đi; app sẽ nhắc đúng 8h sáng ngày đó.",
    "5. Quốc tịch và Quy mô: chọn trong danh sách. Số điện thoại 8–15 chữ số (có thể có +, dấu cách, dấu gạch).",
    "6. Mỗi dòng tự xếp vào đúng tuần theo \"Ngày tháng\". Một file có thể chứa nhiều tuần. Tuần đã quá hạn nhập thì chỉ Quản trị viên nhập được.",
    "7. Tải lại cùng file không nhân đôi dòng: dòng trùng NVKD + Mục + Ngày + Khách hàng sẽ bị bỏ qua.",
    "",
    "Ví dụ một dòng đủ thông tin:",
    "   Khách hàng mới liên hệ | 27/10/2026 | Công ty TNHH ABC | KCN Quế Võ, Bắc Ninh | Hàn Quốc | 50–200 người | Chị Lan - Phụ trách mua hàng | 0912 345 678 |",
    "   Cần tem decal 5.000 cái/tháng | Gọi điện giới thiệu, gửi catalogue qua Zalo | Gửi báo giá | 30/10/2026",
  ];
  lines.forEach((t, i) => {
    const c = guide.getCell(i + 1, 1);
    c.value = t;
    c.alignment = { wrapText: true, vertical: "top" };
    if (i === 0) c.font = { bold: true, size: 13, color: { argb: NAVY } };
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
