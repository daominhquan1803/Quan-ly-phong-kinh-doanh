import * as XLSX from "xlsx";

// Mẫu thư nhắc công nợ CHÍNH THỨC (văn bản pháp lý gửi khách hàng) — nguyên văn lấy trực tiếp từ
// file mẫu docx anh Quân cung cấp, KHÔNG được diễn giải lại câu chữ. Toàn bộ nội dung thư (tiêu đề,
// thân thư, bảng kê .xlsx) nằm ở file này — đổi mẫu chỉ cần sửa đúng file này, không chạm logic gửi
// ở ../debtDueReminder.ts. Thư chỉ tiếng Việt (anh Quân chốt bỏ song ngữ).

export type DebtReminderMilestone = "D7" | "D0" | "OVERDUE";

export interface DebtReminderInvoice {
  invoiceNumber: string | null;
  invoiceDate: string | null;
  dueDate: string;
  remainingAmount: number;
}

export interface DebtReminderData {
  customerName: string;
  contactPerson: string | null;
  milestone: DebtReminderMilestone;
  occurrence: number; // D7/D0 = 1. Lần theo LỊCH, dùng cho ngưỡng hệ quả (mục D); KHÔNG in ra thư.
  displayOccurrence: number; // số "lần thứ N" in trong thư — xem GIẢ ĐỊNH 11. D7/D0 = 1.
  dueDate: string; // ISO — cả nhóm cùng hạn
  daysFromDue: number; // overdueDays: -7 | 0 | >= 1
  invoices: DebtReminderInvoice[];
  totalRemaining: number;
  salesEmployeeName: string | null;
  salesEmployeePhone: string | null;
  salesEmployeeEmail: string | null;
}

// Thông tin ngân hàng + chữ ký — hằng số cố định, KHÔNG phải bí mật nên không đưa vào env.
const BANK_ACCOUNT_NAME = "CÔNG TY CP GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
const BANK_ACCOUNT_NUMBER = "113002883841";
const BANK_NAME = "Ngân hàng TMCP Công thương Việt Nam (Vietinbank) – Chi nhánh Tp. Hà Nội";
// Chữ ký CỐ ĐỊNH cho cả 3 loại thư — KHÔNG theo NVKD phụ trách (anh Quân chốt).
const SIGNATURE_LINES = ["TL. GIÁM ĐỐC", "TRƯỞNG PHÒNG KINH DOANH 1", "Đào Minh Quân"];
// Thư 2 (D0): hạn chót thanh toán sau ngày đến hạn — nguyên văn mẫu "3 ngày làm việc".
const D0_GRACE_WORKING_DAYS = 3;
// Thư 3 (OVERDUE): "[X] ngày làm việc" mẫu để trống — anh Quân chốt = giống D0, cho thống nhất.
const OVERDUE_PAY_WITHIN_WORKING_DAYS = 3;

// Phần <table> trong thân thư chỉ liệt kê tối đa số dòng này — đủ dòng nằm ở file .xlsx đính kèm.
const MAX_HTML_ROWS = 20;

// Dòng công ty + quốc hiệu, chung cả 3 thư. Mẫu docx tách "CÔNG TY CP GIẢI PHÁP ĐÓNG GÓI" / "HOANG GIA"
// làm 2 dòng do lỗi bảng khi xuất — ở đây nối lại thành 1 tên công ty đầy đủ, đúng chữ BANK_ACCOUNT_NAME.
// Mẫu KHÔNG ghi tên địa danh trước "ngày … tháng … năm …" (để "……, ngày…"), nên KHÔNG bịa tên thành phố —
// chỉ in "Ngày {dd} tháng {mm} năm {yyyy}" theo ngày worker chạy, giờ Asia/Ho_Chi_Minh.
const HEADER_COMPANY = "CÔNG TY CP GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
const HEADER_NATION_LINE1 = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
const HEADER_NATION_LINE2 = "Độc lập – Tự do – Hạnh phúc";

// "V/v:" — dùng lại làm cả tiêu đề email lẫn dòng V/v trong thân thư.
const TITLE_D7 = "Thông báo hóa đơn sắp đến hạn thanh toán";
const TITLE_D0 = "Nhắc thanh toán hóa đơn đến hạn";
const titleOverdue = (occurrence: number) => `Nhắc thanh toán công nợ quá hạn (lần ${occurrence})`;

// Câu mở đầu — CHỈ thư D7 có đoạn cảm ơn này (D0 và OVERDUE không có).
const D7_THANKS = `Công ty CP Giải pháp Đóng gói Hoàng Gia ("Hoàng Gia") trân trọng cảm ơn Quý Công ty đã tin tưởng, hợp tác trong thời gian qua.`;
// Thư D7: chứa hạn + "còn X ngày". ${dueDateText} định dạng dd/mm/yyyy; ${daysLeft} = -daysFromDue (luôn > 0 ở mốc D7).
const d7Intro = (dueDateText: string, daysLeft: number) =>
  `Theo hợp đồng/đơn hàng đã ký kết, Hoàng Gia trân trọng thông báo (các) hóa đơn dưới đây của Quý Công ty sẽ đến hạn thanh toán vào ngày ${dueDateText} (còn ${daysLeft} ngày):`;
const D7_REQUEST = "Kính đề nghị Quý Công ty sắp xếp nguồn vốn và thực hiện thanh toán đúng hạn theo thông tin sau:";

// Thư D0: "hôm nay, ngày ${dueDateText}, là hạn thanh toán...". KHÔNG có đoạn cảm ơn D7_THANKS.
const d0Intro = (dueDateText: string) =>
  `Hoàng Gia trân trọng nhắc Quý Công ty, hôm nay, ngày ${dueDateText}, là hạn thanh toán theo thỏa thuận đối với (các) hóa đơn sau:`;
const D0_REQUEST = `Kính đề nghị Quý Công ty hoàn tất thanh toán trong ngày hôm nay hoặc chậm nhất trong vòng ${D0_GRACE_WORKING_DAYS} ngày làm việc kể từ ngày ra thông báo này, theo thông tin sau:`;
const D0_LATE_NOTICE = "Quá thời hạn nêu trên mà Quý Công ty chưa hoàn tất thanh toán, Hoàng Gia sẽ tính lãi chậm trả theo thỏa thuận tại hợp đồng và quy định pháp luật hiện hành.";

// Thư OVERDUE: 2 dòng căn cứ luật (KHÔNG có dòng "Căn cứ Hợp đồng/Đơn hàng số..." — DebtInvoice
// không liên kết hợp đồng/đơn hàng nào, điền sai/trống trong văn bản pháp lý còn tệ hơn bỏ dòng).
const OVERDUE_LEGAL_BASIS_1 = "Căn cứ Điều 440 và Điều 357 Bộ luật Dân sự số 91/2015/QH13;";
const OVERDUE_LEGAL_BASIS_2 = "Căn cứ Điều 50, Điều 55 và Điều 306 Luật Thương mại số 36/2005/QH11,";
const OVERDUE_INTRO = "Công ty CP Giải pháp Đóng gói Hoàng Gia trân trọng thông báo và đề nghị Quý Công ty thanh toán khoản công nợ đã quá hạn sau đây:";
const overdueDaysLine = (daysFromDue: number) =>
  `Tính đến ngày lập thông báo này, khoản công nợ nêu trên đã quá hạn thanh toán <strong>${daysFromDue}</strong> ngày.`;
const overdueRequest = (occurrence: number) =>
  `Đây là lần nhắc thanh toán thứ ${occurrence} của Hoàng Gia đối với khoản công nợ trên. Kính đề nghị Quý Công ty thanh toán toàn bộ số tiền nêu trên trong vòng ${OVERDUE_PAY_WITHIN_WORKING_DAYS} ngày làm việc kể từ ngày ký thông báo này, theo thông tin sau:`;
const OVERDUE_CONSEQUENCES_INTRO = "Trường hợp Quý Công ty không phản hồi hoặc không hoàn tất thanh toán trong thời hạn nêu trên, Hoàng Gia buộc phải:";
// Ý (1) lãi chậm trả, (2) tạm dừng cung cấp hàng — có ở MỌI thư quá hạn, giữ nguyên từng chữ.
const OVERDUE_CONSEQUENCES_BASE = [
  "Tính lãi chậm trả trên số tiền chậm thanh toán theo lãi suất thỏa thuận tại hợp đồng (hoặc theo lãi suất nợ quá hạn trung bình trên thị trường tại thời điểm thanh toán, nếu hợp đồng không thỏa thuận), phù hợp Điều 306 Luật Thương mại 2005 và Điều 357 Bộ luật Dân sự 2015;",
  "Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo;",
];
// Ý (3) chuyển pháp chế + khởi kiện + chi phí — CHỈ từ tuần quá hạn thứ 7 (sau 6 tuần, d >= 43).
const OVERDUE_CONSEQUENCE_LEGAL_ACTION =
  "Chuyển hồ sơ công nợ cho bộ phận pháp chế để xử lý theo quy định pháp luật, bao gồm khởi kiện ra Tòa án hoặc Trọng tài có thẩm quyền để bảo vệ quyền và lợi ích hợp pháp của Hoàng Gia, mọi chi phí phát sinh (án phí, luật sư, thi hành án…) do Quý Công ty chịu trách nhiệm.";
// Anh Quân chốt: thêm ý khởi kiện SAU 6 TUẦN quá hạn = occurrence (lần theo lịch) >= 7.
const OVERDUE_LEGAL_ACTION_FROM_OCCURRENCE = 7;

/** Danh sách hệ quả theo lần nhắc THEO LỊCH (occurrence, KHÔNG phải displayOccurrence — GIẢ ĐỊNH 11). */
function overdueConsequences(occurrence: number): string[] {
  if (occurrence >= OVERDUE_LEGAL_ACTION_FROM_OCCURRENCE) {
    return [...OVERDUE_CONSEQUENCES_BASE, OVERDUE_CONSEQUENCE_LEGAL_ACTION];
  }
  // Chỉ 2 ý -> ý (2) là ý CUỐI danh sách, đổi dấu ";" cuối thành "." (GIẢ ĐỊNH 16, chỉ đổi dấu câu).
  const [item1, item2] = OVERDUE_CONSEQUENCES_BASE;
  return [item1, item2.replace(/;$/, ".")];
}
const OVERDUE_GOODWILL = "Hoàng Gia mong muốn tiếp tục hợp tác lâu dài và đề nghị Quý Công ty phối hợp thanh toán sớm để tránh phát sinh các bước xử lý nêu trên.";

// Chung cả 3 thư.
const COMMON_PAID_ALREADY = "Rất mong Quý Công ty quan tâm, sắp xếp thanh toán đúng thời hạn. Trường hợp đã thanh toán, kính đề nghị Quý Công ty gửi chứng từ chuyển khoản để chúng tôi đối chiếu, tránh trùng lặp.";
const COMMON_CONTACT_INTRO = "Mọi thắc mắc, Quý Công ty vui lòng liên hệ:";
// Câu kết ngay trước chữ ký — GIỐNG HỆT nhau ở cả 3 thư.
const COMMON_CLOSING = "Trân trọng cảm ơn sự hợp tác của Quý Công ty.";

/** Tiền dạng "1.234.567" (không hậu tố "đ" — cột bảng đã ghi "(VNĐ)"). */
function money(n: number): string {
  return Math.round(n).toLocaleString("vi-VN");
}

/** Ngày dạng dd/MM/yyyy — ép múi giờ VN vì app lưu ngày dạng "nửa đêm giờ VN quy đổi UTC" (cùng lý do
 * với formatDateVN ở apps/web/src/lib/utils.ts), không phụ thuộc TZ của máy chạy worker. */
const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});
function formatDate(iso: string | null): string {
  if (!iso) return "";
  return dateFormatter.format(new Date(iso));
}
function formatDay(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
function formatMonth(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { month: "2-digit", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
function formatYear(d: Date): string {
  return new Intl.DateTimeFormat("vi-VN", { year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(d);
}
const headerDateLine = (d: Date) => `Ngày ${formatDay(d)} tháng ${formatMonth(d)} năm ${formatYear(d)}`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function buildDebtReminderSubject(data: DebtReminderData): string {
  if (data.milestone === "D7") return `V/v: ${TITLE_D7}`;
  if (data.milestone === "D0") return `V/v: ${TITLE_D0}`;
  return `V/v: ${titleOverdue(data.displayOccurrence)}`;
}

export function buildDebtReminderHtml(data: DebtReminderData): string {
  const dueDateText = formatDate(data.dueDate);
  const title = data.milestone === "D7" ? TITLE_D7 : data.milestone === "D0" ? TITLE_D0 : titleOverdue(data.displayOccurrence);

  const lines: string[] = [];
  // 1. Quốc hiệu + tiêu ngữ + ngày + V/v.
  lines.push(
    `<p>${esc(HEADER_COMPANY)}<br/>${esc(HEADER_NATION_LINE1)}<br/><strong>${esc(HEADER_NATION_LINE2)}</strong><br/>${esc(headerDateLine(new Date()))}</p>`,
    `<p><strong>V/v: ${esc(title)}</strong></p>`
  );
  // 2. Kính gửi — KHÔNG có dòng "Địa chỉ:". KHÔNG tự thêm tiền tố "Công ty " vì customerName lấy từ
  // AMIS thường đã có sẵn "CÔNG TY..."/"Công ty..." ở đầu — thêm cứng sẽ ra "Công ty Công ty ABC".
  lines.push(`<p>Kính gửi: ${esc(data.customerName)}</p>`);
  // 3. Chỉ D0: Người nhận.
  if (data.milestone === "D0" && data.contactPerson) {
    lines.push(`<p>Người nhận: ${esc(data.contactPerson)}</p>`);
  }
  // 4. Chỉ D7: câu cảm ơn.
  if (data.milestone === "D7") lines.push(`<p>${D7_THANKS}</p>`);
  // 5. Chỉ OVERDUE: căn cứ luật.
  if (data.milestone === "OVERDUE") {
    lines.push(`<p>${OVERDUE_LEGAL_BASIS_1}<br/>${OVERDUE_LEGAL_BASIS_2}</p>`);
  }
  // 6. Câu mở đầu theo mốc.
  if (data.milestone === "D7") lines.push(`<p>${d7Intro(dueDateText, -data.daysFromDue)}</p>`);
  else if (data.milestone === "D0") lines.push(`<p>${d0Intro(dueDateText)}</p>`);
  else lines.push(`<p>${OVERDUE_INTRO}</p>`);

  // 7. Bảng.
  const shown = data.invoices.slice(0, MAX_HTML_ROWS);
  const rows = shown
    .map(
      (inv) => `
        <tr>
          <td style="border:1px solid #ccc;padding:6px 10px">${esc(inv.invoiceNumber ?? "—")}</td>
          <td style="border:1px solid #ccc;padding:6px 10px">${formatDate(inv.invoiceDate) || "—"}</td>
          <td style="border:1px solid #ccc;padding:6px 10px;text-align:right">${money(inv.remainingAmount)}</td>
          <td style="border:1px solid #ccc;padding:6px 10px">${formatDate(inv.dueDate)}</td>
        </tr>`
    )
    .join("");
  const moreNote =
    data.invoices.length > shown.length
      ? `<p><em>Còn ${data.invoices.length - shown.length} hóa đơn khác — xem đầy đủ trong tệp đính kèm.</em></p>`
      : "";
  lines.push(`
    <table style="border-collapse:collapse;font-size:14px">
      <thead>
        <tr style="background:#f2f2f2">
          <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Số hóa đơn</th>
          <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Ngày hóa đơn</th>
          <th style="border:1px solid #ccc;padding:6px 10px;text-align:right">Giá trị (VNĐ)</th>
          <th style="border:1px solid #ccc;padding:6px 10px;text-align:left">Hạn thanh toán</th>
        </tr>
      </thead>
      <tbody>${rows}
        <tr style="font-weight:bold">
          <td colspan="2" style="border:1px solid #ccc;padding:6px 10px;text-align:right">Tổng cộng</td>
          <td style="border:1px solid #ccc;padding:6px 10px;text-align:right">${money(data.totalRemaining)}</td>
          <td style="border:1px solid #ccc;padding:6px 10px"></td>
        </tr>
      </tbody>
    </table>
    ${moreNote}
  `);

  // 8. Đoạn đề nghị theo mốc (OVERDUE có thêm dòng số ngày quá hạn trước đó).
  if (data.milestone === "OVERDUE") lines.push(`<p>${overdueDaysLine(data.daysFromDue)}</p>`);
  lines.push(
    `<p>${data.milestone === "D7" ? D7_REQUEST : data.milestone === "D0" ? D0_REQUEST : overdueRequest(data.displayOccurrence)}</p>`
  );

  // 9. Thông tin chuyển khoản.
  lines.push(
    `<p>Tên tài khoản: ${esc(BANK_ACCOUNT_NAME)}<br/>Số tài khoản: ${esc(BANK_ACCOUNT_NUMBER)}<br/>Ngân hàng: ${esc(BANK_NAME)}</p>`
  );

  // 10. Chỉ D0: cảnh báo lãi chậm trả. Chỉ OVERDUE: hệ quả.
  if (data.milestone === "D0") lines.push(`<p>${D0_LATE_NOTICE}</p>`);
  if (data.milestone === "OVERDUE") {
    lines.push(
      `<p>${OVERDUE_CONSEQUENCES_INTRO}</p>`,
      `<ul>${overdueConsequences(data.occurrence).map((c) => `<li>${c}</li>`).join("")}</ul>`,
      `<p>${OVERDUE_GOODWILL}</p>`
    );
  }

  // 11. Câu chung.
  lines.push(`<p>${COMMON_PAID_ALREADY}</p>`);

  // 12. Liên hệ.
  const contactLines = [
    data.salesEmployeeName ? `Người phụ trách: ${esc(data.salesEmployeeName)}` : null,
    data.salesEmployeePhone ? `Điện thoại: ${esc(data.salesEmployeePhone)}` : null,
    data.salesEmployeeEmail ? `Email: ${esc(data.salesEmployeeEmail)}` : null,
  ].filter((l): l is string => l !== null);
  lines.push(`<p>${COMMON_CONTACT_INTRO}${contactLines.length > 0 ? `<br/>${contactLines.join("<br/>")}` : ""}</p>`);

  // 13. Câu kết.
  lines.push(`<p>${COMMON_CLOSING}</p>`);

  // 14. Chữ ký — LUÔN in, cố định, không theo NVKD.
  lines.push(`<p>${SIGNATURE_LINES.join("<br/>")}</p>`);

  return lines.join("\n");
}

/** Bảng kê hoá đơn .xlsx đính kèm — KHÔNG giới hạn số dòng (khác thân thư). */
export function buildDebtReminderXlsx(data: DebtReminderData): Buffer {
  const aoa: (string | number)[][] = [
    ["Số hóa đơn", "Ngày hóa đơn", "Giá trị (VNĐ)", "Hạn thanh toán"],
    ...data.invoices.map((inv) => [inv.invoiceNumber ?? "", formatDate(inv.invoiceDate), Math.round(inv.remainingAmount), formatDate(inv.dueDate)]),
    ["Tổng cộng", "", Math.round(data.totalRemaining), ""],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 28 }, { wch: 26 }, { wch: 20 }, { wch: 26 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bang ke cong no");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
