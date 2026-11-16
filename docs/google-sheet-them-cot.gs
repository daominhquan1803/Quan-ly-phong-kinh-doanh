/**
 * Thêm cột "KH mới liên hệ" vào Google Sheet "Theo dõi khách tiềm năng - PKD1 Hoàng Gia" (16/11/2026).
 *
 * Cách dùng (làm 1 lần, bằng tài khoản có quyền CHỈNH SỬA sheet):
 *   1. Mở sheet -> Tiện ích mở rộng -> Apps Script.
 *   2. KHÔNG xoá script đang có (Mã.gs). Bấm dấu + cạnh "Tệp" -> Tập lệnh -> đặt tên "ThemCot" -> dán toàn bộ file này vào file mới -> bấm Lưu.
 *   3. Chọn hàm "themCotKhachMoiLienHe" ở thanh trên -> bấm Chạy -> cấp quyền cho chính tài khoản của anh.
 *   4. Hộp thoại báo tab nào được thêm cột gì. Chạy lại bao nhiêu lần cũng được (cột đã có thì bỏ qua).
 *
 * An toàn: chỉ THÊM cột mới ở CUỐI BÊN PHẢI mỗi tab (không chèn giữa nên không làm lệch cột AI đang tự điền),
 * không ghi đè ô nào đang có dữ liệu. Nhận diện tab theo tiêu đề cột, không phụ thuộc tên tab.
 * App đọc các cột này theo TÊN tiêu đề — đừng đổi tên tiêu đề cột mới.
 */

var TC_DS_QUOC_TICH = ['Việt Nam', 'Hàn Quốc', 'Nhật Bản', 'Đài Loan', 'Trung Quốc', 'Khác'];
var TC_DS_QUY_MO = ['Dưới 50 người', '50–200 người', '200–1000 người', 'Trên 1000 người'];
var TC_DS_KENH = ['Điện thoại', 'Zalo', 'Email', 'Gặp trực tiếp', 'LinkedIn/Facebook', 'Messenger'];
var TC_DS_KET_QUA = ['Quan tâm, hẹn gọi lại', 'Đã gửi báo giá', 'Đã gửi mẫu', 'Đang đàm phán', 'Có đơn hàng', 'Không liên lạc được', 'Sai số / sai đầu mối', 'Đã có NCC, từ chối', 'Loại (không phù hợp)'];

var TC_COT_CHUNG = {
  quocTich: { h: 'Quốc tịch', re: /^quoc tich/, list: TC_DS_QUOC_TICH, w: 110 },
  quyMo: { h: 'Quy mô', re: /^quy mo/, list: TC_DS_QUY_MO, w: 130 },
  nhuCau: { h: 'Nhu cầu', re: /^nhu cau/, w: 220 },
  viecDaLam: { h: 'Việc đã làm', re: /^viec da lam/, w: 220 },
  hanhDong: { h: 'Hành động tiếp theo', re: /^hanh dong tiep theo/, w: 200 },
  ngayHen: { h: 'Ngày hẹn nhắc', re: /^ngay hen nhac/, date: true, w: 110 },
  kenh: { h: 'Kênh liên hệ', re: /^kenh lien he/, list: TC_DS_KENH, w: 130 },
};

// Cột thêm theo từng loại tab (đủ 10 mục của "KH mới liên hệ": công ty, địa chỉ, quốc tịch, quy mô, người liên hệ, SĐT, nhu cầu, việc đã làm, hành động tiếp theo, ngày hẹn nhắc).
var TC_SPEC = {
  // Tab "Hỏi hàng MXH" (bài quét Facebook): thêm đủ 10 mục + kênh.
  FB: [
    { h: 'Tên công ty / khách', re: /^ten (cong ty|khach)/, w: 200 },
    { h: 'Địa chỉ', re: /^dia chi/, w: 220 },
    TC_COT_CHUNG.quocTich,
    TC_COT_CHUNG.quyMo,
    { h: 'Người liên hệ', re: /^nguoi lien he/, w: 150 },
    { h: 'Số điện thoại', re: /^(so )?dien thoai|^sdt/, w: 130 },
    TC_COT_CHUNG.nhuCau,
    TC_COT_CHUNG.viecDaLam,
    TC_COT_CHUNG.hanhDong,
    TC_COT_CHUNG.ngayHen,
    TC_COT_CHUNG.kenh,
  ],
  // Tab "Theo dõi" (khách doanh nghiệp quét báo): đã có công ty, địa chỉ, người liên hệ, SĐT, kênh, kết quả, bước tiếp theo, ngày hẹn tiếp -> thêm 4 cột còn thiếu.
  SCAN: [TC_COT_CHUNG.quocTich, TC_COT_CHUNG.quyMo, TC_COT_CHUNG.nhuCau, TC_COT_CHUNG.viecDaLam],
  // Tab "… tự tìm": đã có công ty, địa chỉ, người liên hệ, SĐT -> thêm ngày/kênh/kết quả + các mục còn thiếu.
  SELF: [
    { h: 'Ghi chú', re: /^ghi chu/, w: 220 },
    { h: 'Ngày liên hệ', re: /^ngay lien he/, date: true, w: 110 },
    TC_COT_CHUNG.kenh,
    { h: 'Kết quả liên hệ', re: /^ket qua lien he/, list: TC_DS_KET_QUA, w: 170 },
    TC_COT_CHUNG.quocTich,
    TC_COT_CHUNG.quyMo,
    TC_COT_CHUNG.nhuCau,
    TC_COT_CHUNG.viecDaLam,
    TC_COT_CHUNG.hanhDong,
    TC_COT_CHUNG.ngayHen,
  ],
};

function tcNorm_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tcCoMot_(h, re) {
  return h.some(function (x) { return re.test(x); });
}

// Tìm dòng tiêu đề (trong 10 dòng đầu) thoả điều kiện.
function tcTimDong_(sh, test) {
  var n = Math.min(10, sh.getLastRow());
  if (n < 1) return 0;
  var vals = sh.getRange(1, 1, n, Math.max(sh.getLastColumn(), 1)).getValues();
  for (var i = 0; i < n; i++) {
    if (test(vals[i].map(tcNorm_))) return i + 1;
  }
  return 0;
}

function tcNhanDang_(sh) {
  var r = tcTimDong_(sh, function (h) { return tcCoMot_(h, /^ngay quet/) && tcCoMot_(h, /^link/); });
  if (r) return { kind: 'FB', row: r };
  r = tcTimDong_(sh, function (h) { return tcCoMot_(h, /^ngay tim/) && tcCoMot_(h, /^ten cong ty/) && tcCoMot_(h, /^hang$/); });
  if (r) return { kind: 'SCAN', row: r };
  r = tcTimDong_(sh, function (h) { return tcCoMot_(h, /^ngay tim/) && tcCoMot_(h, /^ten cong ty/); });
  if (r) return { kind: 'SELF', row: r };
  return null;
}

function tcThemCot_(sh, row, specs) {
  var headers = sh.getRange(row, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0];
  var nh = headers.map(tcNorm_);
  var last = 0;
  headers.forEach(function (v, i) { if (String(v).trim()) last = i + 1; });
  var added = [];
  specs.forEach(function (sp) {
    if (nh.some(function (x) { return sp.re.test(x); })) return; // đã có cột này
    last++;
    if (last > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), last - sh.getMaxColumns());
    sh.getRange(row, last).setValue(sp.h).setFontWeight('bold').setBackground('#ffe599').setWrap(true);
    var body = sh.getRange(row + 1, last, Math.max(sh.getMaxRows() - row, 1), 1);
    if (sp.date) {
      body.setNumberFormat('dd/mm/yyyy');
      body.setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).setHelpText('Nhập ngày dạng dd/mm/yyyy').build());
    } else if (sp.list) {
      body.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(sp.list, true).setAllowInvalid(false).setHelpText('Chọn từ danh sách').build());
    }
    sh.setColumnWidth(last, sp.w || 150);
    added.push(sp.h);
  });
  return added;
}

function themCotKhachMoiLienHe() {
  var ss = SpreadsheetApp.getActive();
  var report = [];
  ss.getSheets().forEach(function (sh) {
    var k = tcNhanDang_(sh);
    if (!k) return;
    var added = tcThemCot_(sh, k.row, TC_SPEC[k.kind]);
    report.push(sh.getName() + ': ' + (added.length ? 'thêm ' + added.join(', ') : 'đã đủ cột'));
  });
  SpreadsheetApp.getUi().alert('Kết quả', report.length ? report.join('\n') : 'Không nhận ra tab nào cần thêm cột.', SpreadsheetApp.getUi().ButtonSet.OK);
}
