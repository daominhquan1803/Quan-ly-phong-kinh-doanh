import { describe, expect, it } from "vitest";
import { careLogSchema, normalizeCareLog } from "./customer-care";

const now = new Date("2026-10-19T03:00:00Z");
const base = { customerId: "c1", channel: "CALL" as const };

describe("careLogSchema", () => {
  it("ISSUE bắt buộc chọn lý do", () => {
    expect(careLogSchema.safeParse({ ...base, outcome: "ISSUE" }).success).toBe(false);
    expect(careLogSchema.safeParse({ ...base, outcome: "ISSUE", issueType: "PRICE" }).success).toBe(false); // thiếu ghi chú
    expect(careLogSchema.safeParse({ ...base, outcome: "ISSUE", issueType: "PRICE", note: "chê giá cao" }).success).toBe(true);
  });
  it("Có vấn đề / Mất khách / Đã xử lý xong bắt buộc ghi chú", () => {
    expect(careLogSchema.safeParse({ ...base, outcome: "LOST" }).success).toBe(false);
    expect(careLogSchema.safeParse({ ...base, outcome: "LOST", note: "chuyển sang NCC giá rẻ" }).success).toBe(true);
    expect(careLogSchema.safeParse({ ...base, outcome: "RESOLVED", note: "   " }).success).toBe(false);
    expect(careLogSchema.safeParse({ ...base, outcome: "RESOLVED", note: "đã giảm giá 3%" }).success).toBe(true);
  });
  it("UPCOMING_ORDER bắt buộc tháng dự kiến", () => {
    expect(careLogSchema.safeParse({ ...base, outcome: "UPCOMING_ORDER" }).success).toBe(false);
    expect(careLogSchema.safeParse({ ...base, outcome: "UPCOMING_ORDER", expectedMonth: 11 }).success).toBe(true);
  });
  it("từ chối kết quả ngoài danh sách (không cho gõ tự do)", () => {
    expect(careLogSchema.safeParse({ ...base, outcome: "ĐÃ LIÊN HỆ" }).success).toBe(false);
  });
});

describe("normalizeCareLog", () => {
  it("NO_CONTACT tự hẹn gọi lại sau 3 ngày", () => {
    const r = normalizeCareLog(careLogSchema.parse({ ...base, outcome: "NO_CONTACT" }), now);
    expect(r.followUpAt?.toISOString()).toBe("2026-10-22T03:00:00.000Z");
  });
  it("bỏ các trường không thuộc kết quả đã chọn", () => {
    const r = normalizeCareLog(
      careLogSchema.parse({ ...base, outcome: "NORMAL", issueType: "PRICE", needGroup: "tem", expectedMonth: 3 }),
      now
    );
    expect(r).toMatchObject({ issueType: null, needGroup: null, expectedMonth: null, followUpAt: null });
  });
  it("NEW_NEED giữ nhóm SP, khoảng giá trị, tháng", () => {
    const r = normalizeCareLog(
      careLogSchema.parse({ ...base, outcome: "NEW_NEED", needGroup: "tem decal", needValueBand: "20_100", expectedMonth: 12, followUpDays: 7 }),
      now
    );
    expect(r).toMatchObject({ needGroup: "tem decal", needValueBand: "20_100", expectedMonth: 12 });
    expect(r.followUpAt?.toISOString()).toBe("2026-10-26T03:00:00.000Z");
  });
});
