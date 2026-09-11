import { describe, it, expect } from "vitest";
import { formatDateVN, toDateInputValueVN } from "./utils";

// Cả 2 hàm dưới đây PHẢI ép cứng múi giờ Việt Nam (Asia/Ho_Chi_Minh) khi đọc ra ngày dương lịch
// từ 1 thời điểm ISO — vì app luôn lưu ngày dạng "nửa đêm giờ VN quy đổi UTC" (vd 30/08 lưu
// thành "2026-08-29T17:00:00.000Z"). Nếu không ép múi giờ, kết quả sẽ phụ thuộc múi giờ của
// MÁY chạy code (múi giờ hệ điều hành/trình duyệt người xem, hoặc TZ của máy chạy test) — đúng
// lỗi thật anh Quân báo: upload phiếu đi hàng hiện sai lùi 1 ngày.
describe("formatDateVN", () => {
  it("đọc đúng ngày Việt Nam từ 1 mốc UTC lúc 17:00 hôm trước (nửa đêm giờ VN)", () => {
    // "2026-08-29T17:00:00.000Z" = đúng 00:00 ngày 30/08/2026 giờ Việt Nam (UTC+7).
    expect(formatDateVN("2026-08-29T17:00:00.000Z")).toBe("30/08/2026");
  });

  it("không bị lùi ngày dù chạy trên máy có múi giờ khác (không phụ thuộc TZ máy chạy code)", () => {
    // 23:59 UTC vẫn là 06:59 sáng hôm sau giờ VN — vẫn phải ra đúng ngày hôm sau theo giờ VN.
    expect(formatDateVN("2026-01-01T23:59:00.000Z")).toBe("02/01/2026");
  });

  it("trả về '—' khi không có ngày", () => {
    expect(formatDateVN(null)).toBe("—");
    expect(formatDateVN(undefined)).toBe("—");
  });
});

describe("toDateInputValueVN", () => {
  it("trả về đúng yyyy-mm-dd theo giờ Việt Nam, KHÔNG bị lùi 1 ngày như cắt chuỗi ISO thô", () => {
    // Lỗi cũ: chuỗi.slice(0,10) trên "2026-08-29T17:00:00.000Z" ra "2026-08-29" (SAI, lùi 1
    // ngày) — phải ra đúng "2026-08-30" vì đó là 00:00 giờ VN ngày 30/08.
    expect(toDateInputValueVN("2026-08-29T17:00:00.000Z")).toBe("2026-08-30");
  });

  it("xử lý đúng khi ngày UTC và ngày VN trùng nhau (giữa trưa)", () => {
    expect(toDateInputValueVN("2026-03-15T04:00:00.000Z")).toBe("2026-03-15");
  });

  it("trả về chuỗi rỗng khi không có ngày", () => {
    expect(toDateInputValueVN(null)).toBe("");
    expect(toDateInputValueVN(undefined)).toBe("");
  });
});
