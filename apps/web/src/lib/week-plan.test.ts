import { describe, it, expect } from "vitest";
import { startOfWeek, weekRange, addWeeks, formatWeekLabel, matchMetricFromSectionLabel } from "./week-plan";

describe("startOfWeek", () => {
  it("trả về đúng thứ Hai cho các ngày trong tuần", () => {
    // Thứ Ba 25/08/2026 -> thứ Hai 24/08/2026
    expect(startOfWeek(new Date(2026, 7, 25)).toDateString()).toBe(new Date(2026, 7, 24).toDateString());
    // Chủ nhật 30/08/2026 -> thứ Hai 24/08/2026 (cùng tuần)
    expect(startOfWeek(new Date(2026, 7, 30)).toDateString()).toBe(new Date(2026, 7, 24).toDateString());
    // Chính thứ Hai giữ nguyên
    expect(startOfWeek(new Date(2026, 7, 24)).toDateString()).toBe(new Date(2026, 7, 24).toDateString());
  });

  it("xử lý đúng khi tuần vắt qua 2 tháng/năm", () => {
    // Thứ Bảy 2/1/2027 thuộc tuần bắt đầu thứ Hai 28/12/2026
    expect(startOfWeek(new Date(2027, 0, 2)).toDateString()).toBe(new Date(2026, 11, 28).toDateString());
  });
});

describe("weekRange", () => {
  it("trả về khoảng [thứ Hai 00:00, thứ Hai tuần sau 00:00)", () => {
    const { start, end } = weekRange(new Date(2026, 7, 26));
    expect(start.toDateString()).toBe(new Date(2026, 7, 24).toDateString());
    expect(end.toDateString()).toBe(new Date(2026, 7, 31).toDateString());
  });
});

describe("addWeeks", () => {
  it("cộng/trừ đúng số tuần", () => {
    const base = new Date(2026, 7, 24);
    expect(addWeeks(base, 1).toDateString()).toBe(new Date(2026, 7, 31).toDateString());
    expect(addWeeks(base, -1).toDateString()).toBe(new Date(2026, 7, 17).toDateString());
  });
});

describe("formatWeekLabel", () => {
  it("hiện đúng khoảng ngày trong tuần", () => {
    expect(formatWeekLabel(new Date(2026, 7, 25))).toBe("Tuần 24/08 – 30/08/2026");
  });
});

describe("matchMetricFromSectionLabel", () => {
  it("khớp đúng 3 mục nhập tay theo từ khoá, không phân biệt hoa/thường/dấu", () => {
    expect(matchMetricFromSectionLabel("KHÁCH HÀNG MỚI LIÊN HỆ ĐƯỢC")).toBe("NEW_CONTACT");
    expect(matchMetricFromSectionLabel("khach hang moi lien he duoc")).toBe("NEW_CONTACT");
    expect(matchMetricFromSectionLabel("KHÁCH HÀNG MỚI HẸN GẶP ĐƯỢC")).toBe("NEW_MEETING");
    expect(matchMetricFromSectionLabel("Khách hàng cũ liên hệ gặp thăm hỏi")).toBe("EXISTING_VISIT");
  });

  it("trả về null khi không khớp mục nào hoặc chuỗi rỗng", () => {
    expect(matchMetricFromSectionLabel("")).toBeNull();
    expect(matchMetricFromSectionLabel("Ghi chú linh tinh")).toBeNull();
  });
});
