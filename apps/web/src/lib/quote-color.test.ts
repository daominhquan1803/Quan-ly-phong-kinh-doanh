import { describe, it, expect } from "vitest";
import { classifyQuoteStatusByColor, hexToHsl } from "@hoanggia/db";

describe("hexToHsl", () => {
  it("parses pure red/green/yellow correctly", () => {
    expect(hexToHsl("FF0000")).toMatchObject({ h: 0 });
    expect(hexToHsl("00FF00")).toMatchObject({ h: 120 });
    expect(hexToHsl("FFFF00")).toMatchObject({ h: 60 });
  });

  it("returns null for invalid input", () => {
    expect(hexToHsl("")).toBeNull();
    expect(hexToHsl("zzzzzz")).toBeNull();
    expect(hexToHsl("abc")).toBeNull();
  });
});

describe("classifyQuoteStatusByColor", () => {
  it("không có màu (null/undefined) -> Chưa báo giá", () => {
    expect(classifyQuoteStatusByColor(null)).toBe("NOT_QUOTED");
    expect(classifyQuoteStatusByColor(undefined)).toBe("NOT_QUOTED");
  });

  it("trắng / gần trắng -> Chưa báo giá", () => {
    expect(classifyQuoteStatusByColor("FFFFFF")).toBe("NOT_QUOTED");
    expect(classifyQuoteStatusByColor("F6F8F9")).toBe("NOT_QUOTED"); // rất nhạt, thấy thật trong file tháng 8
  });

  it("các sắc xanh lá khác nhau đều -> Chốt được giá (WON)", () => {
    // Toàn bộ các mã màu xanh lá thật đã thấy trong file nguồn (nhiều sắc độ khác nhau).
    for (const hex of ["00FF00", "70AD47", "B6D7A8", "92D050", "D9EAD3", "B7E1CD"]) {
      expect(classifyQuoteStatusByColor(hex)).toBe("WON");
    }
  });

  it("đỏ và hồng nhạt đều -> Không bán được (LOST)", () => {
    expect(classifyQuoteStatusByColor("FF0000")).toBe("LOST");
    expect(classifyQuoteStatusByColor("F4CCCC")).toBe("LOST"); // hồng nhạt thật trong file tháng 8
  });

  it("vàng -> Đang thương thảo (NEGOTIATING)", () => {
    expect(classifyQuoteStatusByColor("FFFF00")).toBe("NEGOTIATING");
  });

  it("màu lạ (xanh dương/xanh ngọc hiếm gặp) vẫn phân loại theo hue gần nhất, không NaN/crash", () => {
    // Các màu outlier thật đã thấy (chỉ 1-2 dòng, không rõ họ màu) — chấp nhận độ tin cậy thấp,
    // chỉ cần không crash và luôn trả về 1 trong 4 trạng thái hợp lệ.
    for (const hex of ["4472C4", "A2C4C9", "9FC5E8"]) {
      const result = classifyQuoteStatusByColor(hex);
      expect(["NOT_QUOTED", "NEGOTIATING", "WON", "LOST"]).toContain(result);
    }
  });
});
