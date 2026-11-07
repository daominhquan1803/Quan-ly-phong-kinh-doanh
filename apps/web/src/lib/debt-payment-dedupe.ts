// Phát hiện khoản "Tiền về" nhập TRÙNG khi cùng 1 giao dịch ngân hàng nằm trong 2 file khác nhau.
// sourceHash (xem debt-payments-parser.ts) gồm cả mã khách + ngày, nên cùng giao dịch mà mã khách ghi khác
// (vd tên nhân viên thay vì mã khách) hoặc ngày đọc sai năm thì hash khác -> không phát hiện được. Kiểm thêm
// theo SỐ TIỀN + NỘI DUNG giống hệt. Không dùng @hoanggia/db để test import được khi mock db.
const DAY_MS = 86_400_000;
const MIN_KEY_LENGTH = 20; // nội dung quá ngắn/chung chung ("chuyen tien") không đủ căn cứ coi là trùng
const SAME_TX_WINDOW_DAYS = 10;
const FUTURE_SLACK_DAYS = 7;

export function paymentDescKey(desc: string | null | undefined): string {
  return (desc ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface DedupeKey {
  amount: number;
  date: Date | null;
  descKey: string;
}

export interface CustomerTxKey {
  amount: number;
  date: Date | null;
  customerCode: string | null;
}

/** Cùng khách + cùng số tiền + ngày cách nhau không quá 1 ngày, KHÔNG cần nội dung giống nhau: cùng 1 giao dịch hay được ghi 2 kiểu
 * ở 2 file ("Thu tiền khách hàng ... theo hóa đơn ..." của kế toán và dòng sao kê "IBBIZ6088193311.CT TNHH ... chuyen tien") nên
 * so nội dung không nhận ra. Chỉ dùng để so với giao dịch ĐÃ ghi từ file trước, không so các dòng trong cùng 1 file. */
export function isSameCustomerTransaction(a: CustomerTxKey, b: CustomerTxKey): boolean {
  if (!a.customerCode || a.customerCode !== b.customerCode) return false;
  if (Math.abs(a.amount - b.amount) > 0.5 || !a.date || !b.date) return false;
  return Math.abs(a.date.getTime() - b.date.getTime()) <= DAY_MS;
}

/** Cùng số tiền + cùng nội dung (đủ dài) và ngày gần nhau — hoặc 1 bên ngày vô lý (thiếu / ở tương lai do đọc sai năm). */
export function isFuzzyDuplicate(a: DedupeKey, b: DedupeKey, now: Date = new Date()): boolean {
  if (Math.abs(a.amount - b.amount) > 0.5) return false;
  if (a.descKey.length < MIN_KEY_LENGTH || a.descKey !== b.descKey) return false;
  const limit = now.getTime() + FUTURE_SLACK_DAYS * DAY_MS;
  const bad = (d: Date | null) => !d || d.getTime() > limit;
  if (bad(a.date) || bad(b.date)) return true;
  return Math.abs(a.date!.getTime() - b.date!.getTime()) <= SAME_TX_WINDOW_DAYS * DAY_MS;
}
