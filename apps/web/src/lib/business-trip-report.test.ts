import { describe, it, expect } from "vitest";
import { validateReportStops, checkinWarnings, sniffImageMime, type ReportStopInput } from "./business-trip-report";

const met = (o: Partial<ReportStopInput> = {}): ReportStopInput => ({
  stopId: "s1",
  outcome: "MET",
  contactName: "Anh Nam",
  contactPhone: "0901 234 567",
  reportContent: "Trao đổi về đơn hàng quý 4 và giá mới của dòng sản phẩm chính.",
  nextAction: "Gửi báo giá",
  nextActionDue: "2026-10-20",
  ...o,
});
const none = new Map<string, number>();
const bytes = (s: string) => Array.from(s).map((c) => c.charCodeAt(0));

describe("validateReportStops", () => {
  it("báo cáo đầy đủ có định vị -> hợp lệ; có ảnh không định vị -> hợp lệ", () => {
    expect(validateReportStops([met({ checkin: { lat: 10.8, lng: 106.7, accuracyM: 20 } })], none, true)).toEqual([]);
    expect(validateReportStops([met()], new Map([["s1", 1]]), true)).toEqual([]);
  });

  it("Đã gặp: thiếu bằng chứng / SĐT sai / nội dung ngắn / thiếu bước tiếp theo đều báo lỗi; admin nhập hộ bỏ yêu cầu bằng chứng", () => {
    const errs = validateReportStops(
      [met({ contactPhone: "abc", reportContent: "ngắn", nextAction: "", nextActionDue: null })],
      none,
      true
    ).join("|");
    expect(errs).toMatch(/ảnh hoặc định vị/);
    expect(errs).toMatch(/số điện thoại/);
    expect(errs).toMatch(/quá ngắn/);
    expect(errs).toMatch(/bước tiếp theo/);
    expect(errs).toMatch(/hạn/);
    expect(validateReportStops([met()], none, false)).toEqual([]);
  });

  it("Không gặp được chỉ cần lý do; Hẹn gặp lại cần lý do + bước tiếp theo + hạn", () => {
    expect(validateReportStops([{ stopId: "s", outcome: "NOT_MET", reportContent: "Khách đi vắng cả ngày" }], none, true)).toEqual([]);
    expect(validateReportStops([{ stopId: "s", outcome: "NOT_MET", reportContent: "" }], none, true)).toHaveLength(1);
    expect(
      validateReportStops([{ stopId: "s", outcome: "RESCHEDULED", reportContent: "Khách bận họp đột xuất" }], none, true)
    ).toHaveLength(2);
  });
});

describe("checkinWarnings", () => {
  it("cảnh báo độ chính xác thấp, ngoài Việt Nam, khác ngày đi", () => {
    const visit = "2026-10-12T00:00:00+07:00";
    expect(checkinWarnings({ lat: 10.8, lng: 106.7, accuracyM: 30, at: "2026-10-12T03:00:00Z" }, visit)).toEqual([]);
    expect(checkinWarnings({ lat: 40, lng: -74, accuracyM: 900, at: "2026-10-15T03:00:00Z" }, visit)).toHaveLength(3);
  });
});

describe("sniffImageMime", () => {
  it("nhận jpeg/png/webp, từ chối file khác", () => {
    expect(sniffImageMime(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageMime(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffImageMime(Uint8Array.from([...bytes("RIFF"), 0, 0, 0, 0, ...bytes("WEBP")]))).toBe("image/webp");
    expect(sniffImageMime(Uint8Array.from(bytes("<svg")))).toBeNull();
  });
});
