import { describe, expect, it } from "vitest";
import { canonicalProvince, PROVINCES, sameProvince } from "./vn-provinces";

describe("chuẩn hoá tỉnh", () => {
  it("bỏ tiền tố Tỉnh / TP, không phân biệt hoa thường dấu", () => {
    expect(canonicalProvince("Tỉnh Hưng Yên")).toBe("Hưng Yên");
    expect(canonicalProvince("thành phố hải phòng")).toBe("Hải Phòng");
    expect(canonicalProvince("TP. Hồ Chí Minh")).toBe("TP. Hồ Chí Minh");
    expect(canonicalProvince("Bac Ninh")).toBe("Bắc Ninh");
    expect(canonicalProvince("Hà Nội")).toBe("Hà Nội");
  });
  it("gộp tỉnh cũ vào tỉnh sau sáp nhập 2025", () => {
    expect(canonicalProvince("Bắc Giang")).toBe("Bắc Ninh");
    expect(canonicalProvince("Thái Bình")).toBe("Hưng Yên");
    expect(canonicalProvince("Hải Dương")).toBe("Hải Phòng");
    expect(canonicalProvince("Bình Dương")).toBe("TP. Hồ Chí Minh");
    expect(canonicalProvince("Hồ Chí Minh")).toBe("TP. Hồ Chí Minh");
    expect(sameProvince("Tỉnh Thái Bình", "Hưng Yên")).toBe(true);
    expect(sameProvince("Hà Nội", "Bắc Ninh")).toBe(false);
  });
  it("không nhận ra hoặc rỗng thì null / false", () => {
    expect(canonicalProvince("Nước ngoài")).toBeNull();
    expect(canonicalProvince(null)).toBeNull();
    expect(sameProvince(null, "Hà Nội")).toBe(false);
  });
  it("danh sách chọn có 34 tỉnh/TP, mỗi tên tự chuẩn hoá về chính nó", () => {
    expect(PROVINCES).toHaveLength(34);
    expect(PROVINCES.every((p) => canonicalProvince(p) === p)).toBe(true);
  });
});
