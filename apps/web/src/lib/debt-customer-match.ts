/**
 * Mã khách hàng ghi KHÔNG nhất quán giữa 3 nguồn dữ liệu Công nợ — file gốc "Công nợ.xlsx" ghi mã
 * trần (vd "ADTEC", "BAOBISONGLAM"), file hoá đơn AMIS và file "Tiền về" lại có thể có 1 tiền tố
 * chữ cái + dấu chấm (vd "V.BAOBISONGLAM", "C.OT-VN") hoặc dấu chấm cuối (vd "MARUKOH."), và đôi
 * khi không có tiền tố (vd "ASEAN"). Hàm này chuẩn hoá về 1 dạng chung để so khớp 3 nguồn.
 */
export function normalizeCustomerCode(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .trim()
    .toUpperCase()
    .replace(/^[A-Z]\.(?=.)/, "") // bỏ tiền tố "X." (1 chữ cái + dấu chấm) ở đầu, nếu có nội dung sau đó
    .replace(/\.+$/, "") // bỏ dấu chấm cuối
    .trim();
}
