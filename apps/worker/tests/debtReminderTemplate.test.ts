import { describe, it, expect, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  buildDebtReminderHtml,
  buildDebtReminderSubject,
  buildDebtReminderXlsx,
  DebtReminderData,
} from "../src/notifications/templates/debtReminder";

// Chạy: cd apps/worker && npx vitest run  (worker chưa có script test; thư mục tests/ nằm ngoài src/
// nên KHÔNG bị `tsc -p tsconfig.json` của bản build worker biên dịch vào dist).
// Mẫu thư CHÍNH THỨC (văn bản pháp lý) — nguyên văn lấy từ file docx anh Quân cung cấp.

// Hạn 26/09/2026 giờ VN = 25/09 17:00 UTC (app lưu "nửa đêm giờ VN quy đổi UTC").
const DUE_ISO = "2026-09-25T17:00:00.000Z";
const INV_ISO = "2026-08-26T17:00:00.000Z";

function data(over: Partial<DebtReminderData> = {}): DebtReminderData {
  // displayOccurrence mặc định BẰNG occurrence được truyền vào (khớp hành vi "không override" —
  // GIẢ ĐỊNH 11) — test nào cố tình khác 2 số này phải tự truyền displayOccurrence riêng.
  const occurrence = over.occurrence ?? 1;
  return {
    customerName: "Công ty TNHH A",
    contactPerson: "Chị Lan",
    milestone: "D7",
    occurrence,
    displayOccurrence: occurrence,
    dueDate: DUE_ISO,
    daysFromDue: -7,
    invoices: [{ invoiceNumber: "HD001", invoiceDate: INV_ISO, dueDate: DUE_ISO, remainingAmount: 1234567 }],
    totalRemaining: 1234567,
    salesEmployeeName: "Ngô Thanh Tùng",
    salesEmployeePhone: "0900000001",
    salesEmployeeEmail: "tung.thuc@gmail.com",
    ...over,
  };
}

function readXlsx(buf: Buffer): (string | number)[][] {
  const wb = XLSX.read(buf, { type: "buffer" });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as (string | number)[][];
}

describe("buildDebtReminderSubject", () => {
  it("D7 -> tiêu đề đúng mẫu", () => {
    expect(buildDebtReminderSubject(data({ milestone: "D7" }))).toBe("V/v: Thông báo hóa đơn sắp đến hạn thanh toán");
  });
  it("D0 -> tiêu đề đúng mẫu", () => {
    expect(buildDebtReminderSubject(data({ milestone: "D0" }))).toBe("V/v: Nhắc thanh toán hóa đơn đến hạn");
  });
  it("OVERDUE -> tiêu đề có đúng số lần nhắc", () => {
    expect(buildDebtReminderSubject(data({ milestone: "OVERDUE", occurrence: 3 }))).toBe("V/v: Nhắc thanh toán công nợ quá hạn (lần 3)");
  });
});

describe("buildDebtReminderHtml - cấu trúc riêng theo mốc", () => {
  it("D0 có 'Người nhận:' khi có contactPerson", () => {
    const html = buildDebtReminderHtml(data({ milestone: "D0", contactPerson: "Chị Lan" }));
    expect(html).toContain("Người nhận: Chị Lan");
  });
  it("D0 KHÔNG có 'Người nhận:' khi contactPerson null", () => {
    const html = buildDebtReminderHtml(data({ milestone: "D0", contactPerson: null }));
    expect(html).not.toContain("Người nhận:");
  });
  it("D7 và OVERDUE KHÔNG bao giờ có 'Người nhận:'", () => {
    expect(buildDebtReminderHtml(data({ milestone: "D7", contactPerson: "Chị Lan" }))).not.toContain("Người nhận:");
    expect(buildDebtReminderHtml(data({ milestone: "OVERDUE", contactPerson: "Chị Lan", daysFromDue: 8, occurrence: 2 }))).not.toContain("Người nhận:");
  });

  it("OVERDUE có 2 dòng căn cứ luật và đúng số ngày quá hạn; D7/D0 KHÔNG có 'Căn cứ'", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 8, occurrence: 2 }));
    expect(html).toContain("Căn cứ Điều 440");
    expect(html).toContain("Căn cứ Điều 50, Điều 55");
    expect(html).toContain("quá hạn thanh toán <strong>8</strong> ngày");
    expect(buildDebtReminderHtml(data({ milestone: "D7" }))).not.toContain("Căn cứ");
    expect(buildDebtReminderHtml(data({ milestone: "D0", daysFromDue: 0 }))).not.toContain("Căn cứ");
  });

  it("D7 có D7_THANKS ('trân trọng cảm ơn Quý Công ty đã tin tưởng'); D0 và OVERDUE KHÔNG có", () => {
    expect(buildDebtReminderHtml(data({ milestone: "D7" }))).toContain("trân trọng cảm ơn Quý Công ty đã tin tưởng");
    expect(buildDebtReminderHtml(data({ milestone: "D0" }))).not.toContain("trân trọng cảm ơn Quý Công ty đã tin tưởng");
    expect(buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 1 }))).not.toContain("trân trọng cảm ơn Quý Công ty đã tin tưởng");
  });

  it("D0 có D0_LATE_NOTICE ('sẽ tính lãi chậm trả...'); D7/OVERDUE không có", () => {
    expect(buildDebtReminderHtml(data({ milestone: "D0" }))).toContain("sẽ tính lãi chậm trả");
    expect(buildDebtReminderHtml(data({ milestone: "D7" }))).not.toContain("sẽ tính lãi chậm trả");
    expect(buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 1 }))).not.toContain("sẽ tính lãi chậm trả");
  });

  it("OVERDUE (occurrence >= 7) có đủ 3 gạch đầu dòng hệ quả + OVERDUE_GOODWILL; D7/D0 không có", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 43, occurrence: 7 }));
    expect(html).toContain("Tính lãi chậm trả trên số tiền chậm thanh toán");
    expect(html).toContain("Tạm dừng cung cấp hàng hóa/dịch vụ");
    expect(html).toContain("Chuyển hồ sơ công nợ cho bộ phận pháp chế");
    expect(html).toContain("Hoàng Gia mong muốn tiếp tục hợp tác lâu dài");
    for (const m of ["D7", "D0"] as const) {
      const h = buildDebtReminderHtml(data({ milestone: m }));
      expect(h).not.toContain("Tạm dừng cung cấp hàng hóa/dịch vụ");
      expect(h).not.toContain("Hoàng Gia mong muốn tiếp tục hợp tác lâu dài");
    }
  });

  it("cả 3 thư đều có COMMON_CLOSING ngay trước chữ ký", () => {
    for (const [milestone, daysFromDue] of [["D7", -7], ["D0", 0], ["OVERDUE", 1]] as const) {
      const html = buildDebtReminderHtml(data({ milestone, daysFromDue }));
      const closingIdx = html.indexOf("Trân trọng cảm ơn sự hợp tác của Quý Công ty.");
      const signatureIdx = html.indexOf("Đào Minh Quân");
      expect(closingIdx).toBeGreaterThan(-1);
      expect(signatureIdx).toBeGreaterThan(closingIdx);
    }
  });
});

describe("buildDebtReminderHtml - ý khởi kiện CHỈ xuất hiện từ tuần quá hạn thứ 7 (occurrence >= 7, đợt 3 mục D)", () => {
  it("occurrence: 6 -> KHÔNG có ý khởi kiện/pháp chế, vẫn có ý (1)+(2), ý (2) kết thúc bằng '.'", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 36, occurrence: 6 }));
    expect(html).not.toContain("khởi kiện");
    expect(html).not.toContain("pháp chế");
    expect(html).not.toContain("Trọng tài");
    expect(html).toContain("Tính lãi chậm trả");
    expect(html).toContain("<li>Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo.</li>");
    expect(html).not.toContain("Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo;");
    expect(html).toContain("Trường hợp Quý Công ty không phản hồi");
    expect(html).toContain("Hoàng Gia mong muốn tiếp tục hợp tác lâu dài");
  });

  it("occurrence: 7 -> đủ 3 ý, ý (2) kết thúc bằng ';', có ý khởi kiện", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 43, occurrence: 7 }));
    expect(html).toContain("<li>Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo;</li>");
    expect(html).toContain("khởi kiện ra Tòa án hoặc Trọng tài");
  });

  it("occurrence: 1 -> không có ý khởi kiện (thư OVERDUE lần đầu, ngày quá hạn 1, R3)", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 1, occurrence: 1 }));
    expect(html).not.toContain("khởi kiện");
  });

  it("occurrence: 29 nhưng displayOccurrence: 4 -> VẪN có ý khởi kiện (ngưỡng theo occurrence THEO LỊCH, không theo số in trong thư)", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 200, occurrence: 29, displayOccurrence: 4 }));
    expect(html).toContain("khởi kiện");
    expect(html).toContain("lần nhắc thanh toán thứ 4");
  });

  it("occurrence 29 / displayOccurrence 4: TIÊU ĐỀ (subject) và dòng V/v dùng displayOccurrence — 'lần 4', KHÔNG BAO GIỜ lộ '29' ở bất cứ đâu khách nhìn thấy", () => {
    const d = data({ milestone: "OVERDUE", daysFromDue: 200, occurrence: 29, displayOccurrence: 4 });
    const subject = buildDebtReminderSubject(d);
    expect(subject).toBe("V/v: Nhắc thanh toán công nợ quá hạn (lần 4)");
    expect(subject).not.toContain("29");
    const html = buildDebtReminderHtml(d);
    expect(html).toContain("<strong>V/v: Nhắc thanh toán công nợ quá hạn (lần 4)</strong>");
    expect(html).not.toContain("(lần 29)");
    // "29" xuất hiện HỢP LỆ duy nhất ở "quá hạn thanh toán <strong>200</strong> ngày" (daysFromDue) —
    // không có chuỗi con "29" nào khác (vd không lẫn trong "lần 29" hay tên file dùng chung dữ liệu này).
    expect(html.replace(/quá hạn thanh toán <strong>\d+<\/strong> ngày\./, "")).not.toContain("29");
  });

  it("không override (occurrence === displayOccurrence): subject vẫn dùng đúng số đó, không lệch đi 1", () => {
    for (const n of [1, 2, 7, 15]) {
      const d = data({ milestone: "OVERDUE", daysFromDue: (n - 1) * 7 + 1, occurrence: n });
      expect(buildDebtReminderSubject(d)).toBe(`V/v: Nhắc thanh toán công nợ quá hạn (lần ${n})`);
    }
  });

  const ulItems = (html: string) => Array.from(html.matchAll(/<li>([\s\S]*?)<\/li>/g)).map((m) => m[1]);

  it("mảng 3 ý ghép từ OVERDUE_CONSEQUENCES_BASE + OVERDUE_CONSEQUENCE_LEGAL_ACTION vẫn trùng NGUYÊN VĂN như trước", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 43, occurrence: 7 }));
    expect(ulItems(html)).toEqual([
      "Tính lãi chậm trả trên số tiền chậm thanh toán theo lãi suất thỏa thuận tại hợp đồng (hoặc theo lãi suất nợ quá hạn trung bình trên thị trường tại thời điểm thanh toán, nếu hợp đồng không thỏa thuận), phù hợp Điều 306 Luật Thương mại 2005 và Điều 357 Bộ luật Dân sự 2015;",
      "Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo;",
      "Chuyển hồ sơ công nợ cho bộ phận pháp chế để xử lý theo quy định pháp luật, bao gồm khởi kiện ra Tòa án hoặc Trọng tài có thẩm quyền để bảo vệ quyền và lợi ích hợp pháp của Hoàng Gia, mọi chi phí phát sinh (án phí, luật sư, thi hành án…) do Quý Công ty chịu trách nhiệm.",
    ]);
  });

  it("mảng 2 ý (occurrence < 7): ý (1) giữ nguyên, ý (2) CHỈ khác dấu câu cuối ('.' thay vì ';')", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 1, occurrence: 1 }));
    expect(ulItems(html)).toEqual([
      "Tính lãi chậm trả trên số tiền chậm thanh toán theo lãi suất thỏa thuận tại hợp đồng (hoặc theo lãi suất nợ quá hạn trung bình trên thị trường tại thời điểm thanh toán, nếu hợp đồng không thỏa thuận), phù hợp Điều 306 Luật Thương mại 2005 và Điều 357 Bộ luật Dân sự 2015;",
      "Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo.",
    ]);
  });
});

describe("buildDebtReminderHtml - chữ ký cố định, không theo NVKD", () => {
  it("cả 3 thư có số tài khoản và tên người ký cố định", () => {
    for (const [milestone, daysFromDue] of [["D7", -7], ["D0", 0], ["OVERDUE", 1]] as const) {
      const html = buildDebtReminderHtml(data({ milestone, daysFromDue }));
      expect(html).toContain("113002883841");
      expect(html).toContain("Đào Minh Quân");
      expect(html).toContain("TRƯỞNG PHÒNG KINH DOANH 1");
    }
  });

  it("tên NVKD chỉ xuất hiện ở mục Người phụ trách, KHÔNG ở khối chữ ký cuối thư", () => {
    const html = buildDebtReminderHtml(data({ salesEmployeeName: "Ngô Thanh Tùng" }));
    const signatureBlock = html.slice(html.lastIndexOf("<p>"));
    expect(signatureBlock).not.toContain("Ngô Thanh Tùng");
    expect(html).toContain("Người phụ trách: Ngô Thanh Tùng");
  });

  it("Người phụ trách/Điện thoại/Email null -> bỏ đúng dòng, không in 'null'/'undefined'", () => {
    const html = buildDebtReminderHtml(data({ salesEmployeeName: null, salesEmployeePhone: null, salesEmployeeEmail: null }));
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("Người phụ trách:");
    expect(html).not.toContain("Điện thoại:");
    expect(html).not.toContain("Email:");
    expect(html).toContain("Mọi thắc mắc, Quý Công ty vui lòng liên hệ:");
  });

  it("có tên nhưng thiếu điện thoại/email -> chỉ in đúng dòng có giá trị", () => {
    const html = buildDebtReminderHtml(data({ salesEmployeeName: "Ngô Thanh Tùng", salesEmployeePhone: null, salesEmployeeEmail: null }));
    expect(html).toContain("Người phụ trách: Ngô Thanh Tùng");
    expect(html).not.toContain("Điện thoại:");
    expect(html).not.toContain("Email:");
  });

  it("không có dòng 'Địa chỉ:' và không còn chữ tiếng Anh của bản nháp cũ", () => {
    const html = buildDebtReminderHtml(data());
    expect(html).not.toContain("Địa chỉ:");
    for (const en of ["Payment reminder", "Dear", "Best regards", "Valued customer"]) expect(html).not.toContain(en);
  });
});

describe("buildDebtReminderHtml - dòng 'Kính gửi' KHÔNG tự thêm tiền tố 'Công ty ' (đợt 3, mục B)", () => {
  it("customerName đã có sẵn 'Công ty' -> không bị lặp thành 'Công ty Công ty ...'", () => {
    for (const [milestone, daysFromDue] of [["D7", -7], ["D0", 0], ["OVERDUE", 1]] as const) {
      const html = buildDebtReminderHtml(data({ customerName: "Công ty TNHH A", milestone, daysFromDue }));
      expect(html).toContain("Kính gửi: Công ty TNHH A");
      expect(html).not.toContain("Công ty Công ty");
    }
  });

  it("customerName viết hoa 'CÔNG TY' -> vẫn không lặp chữ", () => {
    const html = buildDebtReminderHtml(data({ customerName: "CÔNG TY CP XYZ" }));
    expect(html).toContain("Kính gửi: CÔNG TY CP XYZ");
    expect(html).not.toContain("Công ty CÔNG TY");
  });

  it("customerName KHÔNG có sẵn 'Công ty' -> câu vẫn đọc bình thường, không tự thêm tiền tố", () => {
    const html = buildDebtReminderHtml(data({ customerName: "Hộ kinh doanh Nguyễn Văn A" }));
    expect(html).toContain("Kính gửi: Hộ kinh doanh Nguyễn Văn A");
  });
});

describe("buildDebtReminderHtml - tiền và ngày (không hậu tố đ, giờ VN)", () => {
  it("tiền dạng 1.234.567 (không có 'đ'), ngày dd/MM/yyyy theo giờ VN (không lệch 1 ngày)", () => {
    const html = buildDebtReminderHtml(data());
    expect(html).toContain("1.234.567");
    expect(html).not.toContain("1.234.567đ");
    expect(html).toContain("26/09/2026"); // hạn: 25/09 17:00Z = 26/09 giờ VN
    expect(html).toContain("27/08/2026"); // ngày hoá đơn
  });

  it("làm tròn số lẻ và luôn in SỐ CÒN PHẢI THU (remainingAmount) chứ không phải giá trị gốc", () => {
    const html = buildDebtReminderHtml(
      data({ invoices: [{ invoiceNumber: "HD1", invoiceDate: null, dueDate: DUE_ISO, remainingAmount: 600000.4 }], totalRemaining: 600000.4 })
    );
    expect(html).toContain("600.000");
  });

  it("thiếu số hoá đơn / ngày hoá đơn -> in dấu '—' chứ không vỡ", () => {
    const html = buildDebtReminderHtml(data({ invoices: [{ invoiceNumber: null, invoiceDate: null, dueDate: DUE_ISO, remainingAmount: 1000 }], totalRemaining: 1000 }));
    expect(html).toContain("—");
    expect(html).not.toContain("Invalid");
  });
});

describe("buildDebtReminderHtml - an toàn HTML (thư gửi ra ngoài)", () => {
  it("escape tên NVKD, người liên hệ, số hoá đơn (không chèn được thẻ/script)", () => {
    const html = buildDebtReminderHtml(
      data({
        contactPerson: '<img src=x onerror="alert(1)">',
        milestone: "D0",
        daysFromDue: 0,
        salesEmployeeName: "<script>alert(2)</script>",
        invoices: [{ invoiceNumber: "<b>HD&1</b>", invoiceDate: INV_ISO, dueDate: DUE_ISO, remainingAmount: 1 }],
        totalRemaining: 1,
      })
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>HD");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;HD&amp;1&lt;/b&gt;");
    expect(html).toContain("&quot;alert(1)&quot;");
  });

  it("tên khách chứa HTML không lọt thành thẻ trong thân thư", () => {
    const html = buildDebtReminderHtml(data({ customerName: "<script>x</script>" }));
    expect(html).not.toContain("<script>");
  });
});

describe("buildDebtReminderHtml - giới hạn 20 dòng, .xlsx đủ dòng", () => {
  const many = (n: number): DebtReminderData => {
    const invoices = Array.from({ length: n }, (_, i) => ({ invoiceNumber: `HD${String(i + 1).padStart(3, "0")}`, invoiceDate: INV_ISO, dueDate: DUE_ISO, remainingAmount: 1000 * (i + 1) }));
    return data({ invoices, totalRemaining: invoices.reduce((s, x) => s + x.remainingAmount, 0) });
  };

  it("đúng 20 hoá đơn -> in đủ, KHÔNG có câu 'xem đầy đủ trong tệp đính kèm'", () => {
    const html = buildDebtReminderHtml(many(20));
    expect(html).toContain("HD020");
    expect(html).not.toContain("xem đầy đủ trong tệp đính kèm");
  });

  it("25 hoá đơn -> bảng HTML chỉ 20 dòng đầu + câu 'Còn 5 hóa đơn khác'", () => {
    const html = buildDebtReminderHtml(many(25));
    expect(html).toContain("HD020");
    expect(html).not.toContain("HD021");
    expect(html).toContain("Còn 5 hóa đơn khác");
  });

  it("dòng Tổng cộng của thân thư là tổng của TẤT CẢ hoá đơn, kể cả phần bị cắt", () => {
    const d = many(25);
    const html = buildDebtReminderHtml(d);
    expect(html).toContain(Math.round(d.totalRemaining).toLocaleString("vi-VN"));
  });

  it(".xlsx: đủ 25 dòng + dòng tổng, không giới hạn 20", () => {
    const d = many(25);
    const rows = readXlsx(buildDebtReminderXlsx(d));
    expect(rows).toHaveLength(1 + 25 + 1); // header + 25 + tổng
    expect(rows[25][0]).toBe("HD025");
    expect(rows[26][2]).toBe(d.totalRemaining);
  });
});

describe("buildDebtReminderHtml - đối chiếu NGUYÊN VĂN từng chữ với mục 4.4 kế hoạch (văn bản pháp lý)", () => {
  // Toàn bộ chuỗi dưới đây chép NGUYÊN VĂN từ .bangiao/ke-hoach.md mục 4.4 — không diễn giải lại,
  // không rút gọn — để bắt được cả lỗi sai 1 dấu câu/1 chữ trong mẫu thư thật gửi khách.
  const D7_THANKS_FULL = `Công ty CP Giải pháp Đóng gói Hoàng Gia ("Hoàng Gia") trân trọng cảm ơn Quý Công ty đã tin tưởng, hợp tác trong thời gian qua.`;
  const D7_REQUEST_FULL = "Kính đề nghị Quý Công ty sắp xếp nguồn vốn và thực hiện thanh toán đúng hạn theo thông tin sau:";
  const D0_REQUEST_FULL =
    "Kính đề nghị Quý Công ty hoàn tất thanh toán trong ngày hôm nay hoặc chậm nhất trong vòng 3 ngày làm việc kể từ ngày ra thông báo này, theo thông tin sau:";
  const D0_LATE_NOTICE_FULL =
    "Quá thời hạn nêu trên mà Quý Công ty chưa hoàn tất thanh toán, Hoàng Gia sẽ tính lãi chậm trả theo thỏa thuận tại hợp đồng và quy định pháp luật hiện hành.";
  const OVERDUE_LEGAL_BASIS_1_FULL = "Căn cứ Điều 440 và Điều 357 Bộ luật Dân sự số 91/2015/QH13;";
  const OVERDUE_LEGAL_BASIS_2_FULL = "Căn cứ Điều 50, Điều 55 và Điều 306 Luật Thương mại số 36/2005/QH11,";
  const OVERDUE_INTRO_FULL = "Công ty CP Giải pháp Đóng gói Hoàng Gia trân trọng thông báo và đề nghị Quý Công ty thanh toán khoản công nợ đã quá hạn sau đây:";
  const OVERDUE_CONSEQUENCES_INTRO_FULL = "Trường hợp Quý Công ty không phản hồi hoặc không hoàn tất thanh toán trong thời hạn nêu trên, Hoàng Gia buộc phải:";
  const OVERDUE_CONSEQUENCE_1_FULL =
    "Tính lãi chậm trả trên số tiền chậm thanh toán theo lãi suất thỏa thuận tại hợp đồng (hoặc theo lãi suất nợ quá hạn trung bình trên thị trường tại thời điểm thanh toán, nếu hợp đồng không thỏa thuận), phù hợp Điều 306 Luật Thương mại 2005 và Điều 357 Bộ luật Dân sự 2015;";
  const OVERDUE_CONSEQUENCE_2_FULL = "Tạm dừng cung cấp hàng hóa/dịch vụ cho các đơn hàng tiếp theo;";
  const OVERDUE_CONSEQUENCE_3_FULL =
    "Chuyển hồ sơ công nợ cho bộ phận pháp chế để xử lý theo quy định pháp luật, bao gồm khởi kiện ra Tòa án hoặc Trọng tài có thẩm quyền để bảo vệ quyền và lợi ích hợp pháp của Hoàng Gia, mọi chi phí phát sinh (án phí, luật sư, thi hành án…) do Quý Công ty chịu trách nhiệm.";
  const OVERDUE_GOODWILL_FULL = "Hoàng Gia mong muốn tiếp tục hợp tác lâu dài và đề nghị Quý Công ty phối hợp thanh toán sớm để tránh phát sinh các bước xử lý nêu trên.";
  const COMMON_PAID_ALREADY_FULL =
    "Rất mong Quý Công ty quan tâm, sắp xếp thanh toán đúng thời hạn. Trường hợp đã thanh toán, kính đề nghị Quý Công ty gửi chứng từ chuyển khoản để chúng tôi đối chiếu, tránh trùng lặp.";
  const COMMON_CONTACT_INTRO_FULL = "Mọi thắc mắc, Quý Công ty vui lòng liên hệ:";
  const COMMON_CLOSING_FULL = "Trân trọng cảm ơn sự hợp tác của Quý Công ty.";
  const HEADER_COMPANY_FULL = "CÔNG TY CP GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
  const HEADER_NATION_LINE1_FULL = "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM";
  const HEADER_NATION_LINE2_FULL = "Độc lập – Tự do – Hạnh phúc"; // en-dash "–", không phải "-"
  const BANK_ACCOUNT_NAME_FULL = "CÔNG TY CP GIẢI PHÁP ĐÓNG GÓI HOÀNG GIA";
  const BANK_ACCOUNT_NUMBER_FULL = "113002883841";
  const BANK_NAME_FULL = "Ngân hàng TMCP Công thương Việt Nam (Vietinbank) – Chi nhánh Tp. Hà Nội";

  it("D7: câu cảm ơn, câu mở đầu (còn X ngày), câu đề nghị khớp NGUYÊN VĂN", () => {
    const html = buildDebtReminderHtml(data({ milestone: "D7", daysFromDue: -7, dueDate: DUE_ISO }));
    expect(html).toContain(D7_THANKS_FULL);
    expect(html).toContain(
      `Theo hợp đồng/đơn hàng đã ký kết, Hoàng Gia trân trọng thông báo (các) hóa đơn dưới đây của Quý Công ty sẽ đến hạn thanh toán vào ngày 26/09/2026 (còn 7 ngày):`
    );
    expect(html).toContain(D7_REQUEST_FULL);
  });

  it("D0: câu mở đầu (hôm nay, ngày...), câu đề nghị (3 ngày làm việc), cảnh báo lãi khớp NGUYÊN VĂN", () => {
    const html = buildDebtReminderHtml(data({ milestone: "D0", daysFromDue: 0, dueDate: DUE_ISO }));
    expect(html).toContain(
      `Hoàng Gia trân trọng nhắc Quý Công ty, hôm nay, ngày 26/09/2026, là hạn thanh toán theo thỏa thuận đối với (các) hóa đơn sau:`
    );
    expect(html).toContain(D0_REQUEST_FULL);
    expect(html).toContain(D0_LATE_NOTICE_FULL);
  });

  it("OVERDUE: 2 dòng căn cứ luật, câu mở đầu, câu số ngày quá hạn, câu 'lần thứ N' khớp NGUYÊN VĂN", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 8, occurrence: 2 }));
    expect(html).toContain(OVERDUE_LEGAL_BASIS_1_FULL);
    expect(html).toContain(OVERDUE_LEGAL_BASIS_2_FULL);
    expect(html).toContain(OVERDUE_INTRO_FULL);
    expect(html).toContain(`Tính đến ngày lập thông báo này, khoản công nợ nêu trên đã quá hạn thanh toán <strong>8</strong> ngày.`);
    expect(html).toContain(
      `Đây là lần nhắc thanh toán thứ 2 của Hoàng Gia đối với khoản công nợ trên. Kính đề nghị Quý Công ty thanh toán toàn bộ số tiền nêu trên trong vòng 3 ngày làm việc kể từ ngày ký thông báo này, theo thông tin sau:`
    );
  });

  it("OVERDUE (occurrence >= 7): đúng 3 gạch đầu dòng hệ quả, NGUYÊN VĂN từng dòng, ĐÚNG THỨ TỰ, trong 1 <ul>", () => {
    const html = buildDebtReminderHtml(data({ milestone: "OVERDUE", daysFromDue: 43, occurrence: 7 }));
    expect(html).toContain(OVERDUE_CONSEQUENCES_INTRO_FULL);
    const ulMatch = html.match(/<ul>([\s\S]*?)<\/ul>/);
    expect(ulMatch).not.toBeNull();
    const liItems = Array.from(ulMatch![1].matchAll(/<li>([\s\S]*?)<\/li>/g)).map((m) => m[1]);
    expect(liItems).toEqual([OVERDUE_CONSEQUENCE_1_FULL, OVERDUE_CONSEQUENCE_2_FULL, OVERDUE_CONSEQUENCE_3_FULL]);
    expect(html).toContain(OVERDUE_GOODWILL_FULL);
  });

  it("chung cả 3 thư: COMMON_PAID_ALREADY, COMMON_CONTACT_INTRO, COMMON_CLOSING khớp NGUYÊN VĂN", () => {
    for (const [milestone, daysFromDue] of [
      ["D7", -7],
      ["D0", 0],
      ["OVERDUE", 1],
    ] as const) {
      const html = buildDebtReminderHtml(data({ milestone, daysFromDue }));
      expect(html).toContain(COMMON_PAID_ALREADY_FULL);
      expect(html).toContain(COMMON_CONTACT_INTRO_FULL);
      expect(html).toContain(COMMON_CLOSING_FULL);
    }
  });

  it("quốc hiệu/tiêu ngữ/tên công ty khớp NGUYÊN VĂN, giữ đúng ký tự gạch nối dài (en-dash '–')", () => {
    const html = buildDebtReminderHtml(data());
    expect(html).toContain(HEADER_COMPANY_FULL);
    expect(html).toContain(HEADER_NATION_LINE1_FULL);
    expect(html).toContain(HEADER_NATION_LINE2_FULL);
    expect(HEADER_NATION_LINE2_FULL).toContain("–"); // en-dash, không phải hyphen thường
  });

  it("ngày phát hành thông báo đúng định dạng 'Ngày {dd} tháng {mm} năm {yyyy}' theo giờ VN", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T17:30:00.000Z")); // 23/09/2026 00:30 giờ VN
    const html = buildDebtReminderHtml(data());
    expect(html).toContain("Ngày 23 tháng 09 năm 2026");
    vi.useRealTimers();
  });

  it("thông tin chuyển khoản đúng NGUYÊN VĂN tên tài khoản / số tài khoản / tên ngân hàng", () => {
    const html = buildDebtReminderHtml(data());
    expect(html).toContain(`Tên tài khoản: ${BANK_ACCOUNT_NAME_FULL}`);
    expect(html).toContain(`Số tài khoản: ${BANK_ACCOUNT_NUMBER_FULL}`);
    expect(html).toContain(`Ngân hàng: ${BANK_NAME_FULL}`);
  });

  it("chữ ký ĐÚNG 3 dòng, ĐÚNG THỨ TỰ 'TL. GIÁM ĐỐC' / 'TRƯỞNG PHÒNG KINH DOANH 1' / 'Đào Minh Quân', là khối <p> cuối cùng", () => {
    for (const [milestone, daysFromDue] of [
      ["D7", -7],
      ["D0", 0],
      ["OVERDUE", 1],
    ] as const) {
      const html = buildDebtReminderHtml(data({ milestone, daysFromDue }));
      const lastP = html.slice(html.lastIndexOf("<p>"));
      expect(lastP).toContain("TL. GIÁM ĐỐC<br/>TRƯỞNG PHÒNG KINH DOANH 1<br/>Đào Minh Quân");
    }
  });

  it("tiêu đề V/v xuất hiện đúng NGUYÊN VĂN trong cả subject lẫn thân thư (không lệch nhau)", () => {
    for (const [milestone, daysFromDue, occurrence] of [
      ["D7", -7, 1],
      ["D0", 0, 1],
      ["OVERDUE", 1, 4],
    ] as const) {
      const d = data({ milestone, daysFromDue, occurrence });
      const subject = buildDebtReminderSubject(d);
      const html = buildDebtReminderHtml(d);
      expect(html).toContain(`V/v: ${subject.replace("V/v: ", "")}`);
      expect(subject.startsWith("V/v: ")).toBe(true);
    }
  });
});

describe("buildDebtReminderXlsx", () => {
  it("là file .xlsx đọc lại được, đúng 4 cột (không có STT), số tiền là SỐ, ngày dd/MM/yyyy giờ VN", () => {
    const buf = buildDebtReminderXlsx(data({ invoices: [{ invoiceNumber: "HD001", invoiceDate: INV_ISO, dueDate: DUE_ISO, remainingAmount: 600000 }], totalRemaining: 600000 }));
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 2).toString()).toBe("PK"); // zip
    const rows = readXlsx(buf);
    expect(rows[0]).toEqual(["Số hóa đơn", "Ngày hóa đơn", "Giá trị (VNĐ)", "Hạn thanh toán"]);
    expect(rows[1]).toEqual(["HD001", "27/08/2026", 600000, "26/09/2026"]);
    expect(rows[2][0]).toBe("Tổng cộng");
    expect(rows[2][2]).toBe(600000);
  });

  it("thiếu số hoá đơn / ngày hoá đơn -> ô trống, không 'null'", () => {
    const rows = readXlsx(buildDebtReminderXlsx(data({ invoices: [{ invoiceNumber: null, invoiceDate: null, dueDate: DUE_ISO, remainingAmount: 5 }], totalRemaining: 5 })));
    expect(rows[1][0]).toBe("");
    expect(rows[1][1]).toBe("");
  });

  it("danh sách rỗng vẫn dựng được file (header + dòng tổng)", () => {
    const rows = readXlsx(buildDebtReminderXlsx(data({ invoices: [], totalRemaining: 0 })));
    expect(rows).toHaveLength(2);
  });
});
