import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyVND(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
}

export function formatDateVN(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  // Ép cứng múi giờ Việt Nam khi hiển thị — hàm này chạy chủ yếu ở client component (trình
  // duyệt), mà Intl.DateTimeFormat KHÔNG khai báo timeZone sẽ tự lấy múi giờ của MÁY người xem
  // (hệ điều hành/trình duyệt), không phải múi giờ Việt Nam. App luôn lưu ngày dạng "nửa đêm giờ
  // VN quy đổi UTC" (vd 27/08 lưu thành 26/08 17:00 UTC) — nếu máy người xem đặt múi giờ khác
  // giờ Việt Nam (vd để mặc định UTC), ngày hiển thị sẽ lệch hẳn 1 ngày so với ngày thật đã nhập
  // trong file Excel. Đây là lỗi thật anh Quân báo (upload phiếu đi hàng hiện sai ngày tháng).
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(d);
}

/** Chuỗi "yyyy-mm-dd" cho <input type="date"> — LẤY ĐÚNG NGÀY THEO GIỜ VIỆT NAM, không phải
 * ngày UTC. App luôn lưu ngày dạng "nửa đêm giờ VN quy đổi UTC" (vd 30/08 lưu thành
 * "2026-08-29T17:00:00.000Z") — nếu chỉ cắt 10 ký tự đầu của chuỗi ISO (`iso.slice(0, 10)`) sẽ
 * LUÔN ra "2026-08-29" (lùi mất đúng 1 ngày so với ngày thật), vì UTC "17:00 hôm trước" luôn
 * thuộc NGÀY DƯƠNG LỊCH khác với giờ Việt Nam. Lỗi này không chỉ hiển thị sai trên form mà còn
 * ÂM THẦM LƯU SAI NGÀY nếu người dùng không tự sửa lại trước khi bấm lưu — nghiêm trọng hơn hẳn
 * lỗi hiển thị thường thấy. Dùng hàm này ở mọi nơi cần điền sẵn giá trị cho input type="date"
 * từ 1 ngày đã lưu trong hệ thống. */
export function toDateInputValueVN(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const dd = parts.find((p) => p.type === "day")?.value ?? "";
  return y && m && dd ? `${y}-${m}-${dd}` : "";
}
