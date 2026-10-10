import { describe, it, expect } from "vitest";
import { resolveReportPeriods, isoWeekString, asOfDateForPeriod } from "./report-period";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

describe("resolveReportPeriods - tháng", () => {
  it("tháng 10/2026 + 2 tháng trước, biên đầu/cuối đúng", () => {
    const p = resolveReportPeriods("month", "2026-10")!;
    expect(p.map((x) => x.label)).toEqual(["10/2026", "09/2026", "08/2026"]);
    expect(ymd(p[0].start)).toBe("2026-10-01");
    expect(ymd(p[0].end)).toBe("2026-11-01");
    expect(ymd(p[1].start)).toBe("2026-09-01");
    expect(ymd(p[1].end)).toBe("2026-10-01");
  });
  it("tháng 1 lùi sang năm trước", () => {
    const p = resolveReportPeriods("month", "2026-01")!;
    expect(p.map((x) => x.label)).toEqual(["01/2026", "12/2025", "11/2025"]);
  });
  it("sai định dạng / tháng ngoài 1-12 -> null", () => {
    expect(resolveReportPeriods("month", "2026-13")).toBeNull();
    expect(resolveReportPeriods("month", "2026-W41")).toBeNull();
    expect(resolveReportPeriods("month", "")).toBeNull();
  });
});

describe("resolveReportPeriods - tuần ISO", () => {
  it("2026-W41 = Thứ 2 05/10 -> Chủ nhật 11/10; 2 tuần trước", () => {
    const p = resolveReportPeriods("week", "2026-W41")!;
    expect(ymd(p[0].start)).toBe("2026-10-05");
    expect(ymd(p[0].end)).toBe("2026-10-12");
    expect(ymd(p[1].start)).toBe("2026-09-28");
    expect(ymd(p[2].start)).toBe("2026-09-21");
    expect(p[0].label).toBe("Tuần 41 (05/10–11/10/2026)");
  });
  it("tuần 1 của 2026 bắt đầu 29/12/2025 (tuần vắt qua năm)", () => {
    const p = resolveReportPeriods("week", "2026-W01")!;
    expect(ymd(p[0].start)).toBe("2025-12-29");
    expect(p[1].label).toBe("Tuần 52 (22/12–28/12/2025)");
  });
  it("isoWeekString ngược lại: 09/10/2026 -> W41, 01/01/2026 -> W01, 31/12/2026 -> W53", () => {
    expect(isoWeekString(new Date(2026, 9, 9))).toBe("2026-W41");
    expect(isoWeekString(new Date(2026, 0, 1))).toBe("2026-W01");
    expect(isoWeekString(new Date(2026, 11, 31))).toBe("2026-W53");
  });
  it("tuần sai -> null", () => {
    expect(resolveReportPeriods("week", "2026-W54")).toBeNull();
    expect(resolveReportPeriods("week", "2026-10")).toBeNull();
  });
});

describe("asOfDateForPeriod", () => {
  const [cur] = resolveReportPeriods("month", "2026-09")!;
  it("kỳ đã kết thúc -> cuối ngày cuối kỳ (30/09)", () => {
    expect(ymd(asOfDateForPeriod(cur, new Date(2026, 9, 10))!)).toBe("2026-09-30");
  });
  it("kỳ đang diễn ra -> null (số hiện tại)", () => {
    expect(asOfDateForPeriod(cur, new Date(2026, 8, 15))).toBeNull();
  });
});
