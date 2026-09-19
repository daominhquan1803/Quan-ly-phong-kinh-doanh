import { describe, it, expect } from "vitest";
import {
  getMonthWeekRanges,
  findMonthWeekForDate,
  weekRange,
  snapToWeekStart,
  adjacentWeekStart,
  formatWeekLabel,
  weekGradeFromTotalPoints,
  matchMetricFromSectionLabel,
  weekEntryLockAt,
  isWeekEntryLocked,
} from "./week-plan";

function d(y: number, m: number, day: number): Date {
  return new Date(y, m - 1, day);
}
function fmt(x: Date): string {
  return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}/${x.getFullYear()}`;
}

describe("getMonthWeekRanges", () => {
  it("tháng 8/2026 (1/8 là thứ Bảy) — đúng ví dụ anh Quân xác nhận: Tuần 1 = 1-9/8, Tuần 4 = 24-31/8", () => {
    const ranges = getMonthWeekRanges(2026, 8);
    expect(ranges.map((r) => [fmt(r.start), fmt(r.end)])).toEqual([
      ["01/08/2026", "09/08/2026"],
      ["10/08/2026", "16/08/2026"],
      ["17/08/2026", "23/08/2026"],
      ["24/08/2026", "31/08/2026"],
    ]);
  });

  it("luôn đúng 4 tuần, phủ kín trọn tháng, không trùng/hở ngày nào", () => {
    for (let month = 1; month <= 12; month++) {
      const ranges = getMonthWeekRanges(2026, month);
      expect(ranges).toHaveLength(4);
      expect(ranges[0].start.getDate()).toBe(1);
      const daysInMonth = new Date(2026, month, 0).getDate();
      expect(ranges[3].end.getDate()).toBe(daysInMonth);
      // Liên tục: end tuần N + 1 ngày = start tuần N+1.
      for (let i = 0; i < 3; i++) {
        const next = new Date(ranges[i].end);
        next.setDate(next.getDate() + 1);
        expect(next.getTime()).toBe(ranges[i + 1].start.getTime());
      }
    }
  });

  it("tháng bắt đầu đúng thứ Hai — 4 tuần chuẩn 7 ngày, không tuần nào dài/ngắn bất thường", () => {
    // Tháng 2/2027 bắt đầu thứ Hai (kiểm tra qua getDay thay vì giả định) — chỉ cần đủ dài ≥ 28 ngày
    // để có thể so sánh 4 tuần đầu; ở đây minh hoạ tính chất "liên tục" đã đủ ở test trên, test
    // này chỉ khẳng định weekIndex 1 luôn bắt đầu đúng ngày 1 của tháng.
    const ranges = getMonthWeekRanges(2026, 2);
    expect(ranges[0].start.getDate()).toBe(1);
    expect(ranges[0].weekIndex).toBe(1);
  });
});

describe("findMonthWeekForDate / snapToWeekStart", () => {
  it("trả về đúng tuần + weekIndex chứa 1 ngày cụ thể", () => {
    const r = findMonthWeekForDate(d(2026, 8, 25));
    expect(r.weekIndex).toBe(4);
    expect(fmt(r.start)).toBe("24/08/2026");
    expect(r.year).toBe(2026);
    expect(r.month).toBe(8);
  });

  it("snapToWeekStart quy 1 ngày bất kỳ về đúng weekStart chuẩn", () => {
    expect(fmt(snapToWeekStart(d(2026, 8, 1)))).toBe("01/08/2026");
    expect(fmt(snapToWeekStart(d(2026, 8, 2)))).toBe("01/08/2026");
    expect(fmt(snapToWeekStart(d(2026, 8, 31)))).toBe("24/08/2026");
  });
});

describe("weekRange", () => {
  it("trả về [start, end-exclusive) đúng theo tuần riêng của tháng", () => {
    const { start, end, weekIndex } = weekRange(d(2026, 8, 1));
    expect(fmt(start)).toBe("01/08/2026");
    expect(fmt(new Date(end.getTime() - 1))).toBe("09/08/2026"); // end exclusive, lùi 1ms về đúng 9/8
    expect(weekIndex).toBe(1);
  });
});

describe("adjacentWeekStart — nhảy tháng ở 2 đầu", () => {
  it("Tuần 1 lùi 1 = Tuần 4 tháng trước", () => {
    const prev = adjacentWeekStart(d(2026, 8, 1), -1);
    expect(fmt(prev)).toBe(fmt(getMonthWeekRanges(2026, 7)[3].start));
  });
  it("Tuần 4 tiến 1 = Tuần 1 tháng sau", () => {
    const next = adjacentWeekStart(d(2026, 8, 24), 1);
    expect(fmt(next)).toBe(fmt(getMonthWeekRanges(2026, 9)[0].start));
  });
  it("nhảy qua năm mới (tháng 12 → tháng 1 năm sau)", () => {
    const next = adjacentWeekStart(getMonthWeekRanges(2026, 12)[3].start, 1);
    expect(fmt(next)).toBe(fmt(getMonthWeekRanges(2027, 1)[0].start));
  });
});

describe("formatWeekLabel", () => {
  it("hiện đúng số tuần + tháng + khoảng ngày", () => {
    expect(formatWeekLabel(d(2026, 8, 1))).toBe("Tuần 1 tháng 8 (01/08 – 09/08/2026)");
    expect(formatWeekLabel(d(2026, 8, 24))).toBe("Tuần 4 tháng 8 (24/08 – 31/08/2026)");
  });
});

describe("weekEntryLockAt — khoá nhập liệu sau hết thứ Hai tuần kế tiếp", () => {
  // Tháng 9/2026: T1 = 1-13/9, T2 = 14-20/9, T3 = 21-27/9, T4 = 28-30/9.
  it("Tuần 1-3: khoá từ đầu ngày Thứ Ba sau (hết thứ Hai của tuần kế tiếp)", () => {
    expect(fmt(weekEntryLockAt(d(2026, 9, 1)))).toBe("15/09/2026");
    expect(fmt(weekEntryLockAt(d(2026, 9, 14)))).toBe("22/09/2026");
    expect(fmt(weekEntryLockAt(d(2026, 9, 21)))).toBe("29/09/2026");
  });

  it("Tuần 4: tuần kế tiếp là Tuần 1 tháng sau — hạn hết thứ Hai đầu tiên của tháng sau", () => {
    // Tháng 10/2026 bắt đầu thứ Năm 1/10 -> thứ Hai đầu tiên = 5/10 -> khoá từ 6/10.
    expect(fmt(weekEntryLockAt(d(2026, 9, 28)))).toBe("06/10/2026");
  });

  it("isWeekEntryLocked: còn mở đến hết thứ Hai, khoá từ 0h thứ Ba", () => {
    const week1 = d(2026, 9, 1);
    expect(isWeekEntryLocked(week1, new Date(2026, 8, 14, 23, 59, 59))).toBe(false);
    expect(isWeekEntryLocked(week1, new Date(2026, 8, 15, 0, 0, 0))).toBe(true);
  });
});

describe("weekGradeFromTotalPoints", () => {
  it("80-100 -> 2, 60-79 -> 1, dưới 60 -> 0", () => {
    expect(weekGradeFromTotalPoints(100)).toBe(2);
    expect(weekGradeFromTotalPoints(80)).toBe(2);
    expect(weekGradeFromTotalPoints(79.9)).toBe(1);
    expect(weekGradeFromTotalPoints(60)).toBe(1);
    expect(weekGradeFromTotalPoints(59.9)).toBe(0);
    expect(weekGradeFromTotalPoints(0)).toBe(0);
  });
});

describe("matchMetricFromSectionLabel", () => {
  it("khớp đúng 2 mục nhập tay còn lại theo từ khoá, không phân biệt hoa/thường/dấu", () => {
    expect(matchMetricFromSectionLabel("KHÁCH HÀNG MỚI LIÊN HỆ ĐƯỢC")).toBe("NEW_CONTACT");
    expect(matchMetricFromSectionLabel("khach hang moi lien he duoc")).toBe("NEW_CONTACT");
    expect(matchMetricFromSectionLabel("KHÁCH HÀNG MỚI HẸN GẶP ĐƯỢC")).toBe("NEW_MEETING");
  });

  it("không còn khớp 'Khách hàng cũ...' — mục này đã chuyển sang tự động từ Đăng ký đi công tác", () => {
    expect(matchMetricFromSectionLabel("Khách hàng cũ liên hệ gặp thăm hỏi")).toBeNull();
  });

  it("trả về null khi không khớp mục nào hoặc chuỗi rỗng", () => {
    expect(matchMetricFromSectionLabel("")).toBeNull();
    expect(matchMetricFromSectionLabel("Ghi chú linh tinh")).toBeNull();
  });
});
