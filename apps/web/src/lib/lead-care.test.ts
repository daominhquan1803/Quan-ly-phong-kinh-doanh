import { describe, it, expect } from "vitest";
import { careCreatedAt, careNote, companyKey, leadCustomerCode, mapChannel, mapOutcome, ownershipOf, vnMidnight } from "./lead-care";

describe("companyKey — ghép tên công ty", () => {
  it("bỏ dấu, loại hình công ty, ký tự lạ", () => {
    expect(companyKey("Công ty TNHH Điện tử ABC")).toBe("dien tu abc");
    expect(companyKey("CÔNG TY CỔ PHẦN  ABC (Việt Nam)")).toBe("abc viet nam");
    expect(companyKey("Điện tử ABC Co., Ltd")).toBe("dien tu abc");
  });
  it("tên khác nhau thì khoá khác (chỉ so bằng nhau, không so gần đúng)", () => {
    expect(companyKey("ABC Vina")).not.toBe(companyKey("ABC"));
    expect(companyKey("Công ty TNHH")).toBe("");
  });
});

describe("mapChannel", () => {
  it("điện thoại / gặp / nhắn tin", () => {
    expect(mapChannel("Điện thoại")).toBe("CALL");
    expect(mapChannel("Gặp trực tiếp")).toBe("MEET");
    for (const k of ["Zalo", "Messenger", "Email", "LinkedIn/Facebook", "", null]) expect(mapChannel(k)).toBe("ZALO");
  });
});

describe("mapOutcome", () => {
  it("mất khách > không liên lạc được > cơ hội bán > bình thường", () => {
    expect(mapOutcome("Đã có NCC, từ chối", "REACHED")).toBe("LOST");
    expect(mapOutcome("Loại (không phù hợp)", "OTHER")).toBe("LOST");
    expect(mapOutcome("Không liên lạc được", "NO_RESPONSE")).toBe("NO_CONTACT");
    expect(mapOutcome("Sai số / sai đầu mối", "NO_RESPONSE")).toBe("NO_CONTACT");
    expect(mapOutcome("Đã gửi báo giá", "REACHED")).toBe("NEW_NEED");
    expect(mapOutcome("Đang đàm phán", "REACHED")).toBe("NEW_NEED");
    expect(mapOutcome("Quan tâm, hẹn gọi lại", "REACHED")).toBe("NORMAL");
    expect(mapOutcome(null, null)).toBe("NORMAL");
  });
});

describe("hồ sơ / thời gian", () => {
  it("quốc tịch -> sở hữu", () => {
    expect(ownershipOf("Việt Nam")).toBe("VN");
    expect(ownershipOf("Hàn Quốc")).toBe("FDI");
  });
  it("ngày hẹn = nửa đêm giờ Việt Nam", () => {
    expect(vnMidnight("2026-11-24").toISOString()).toBe("2026-11-23T17:00:00.000Z");
  });
  it("giờ ghi lần chăm sóc: 12:00 VN, không vượt quá lúc đồng bộ", () => {
    const now = new Date("2026-11-23T09:00:00.000Z");
    expect(careCreatedAt("2026-11-20", now).toISOString()).toBe("2026-11-20T05:00:00.000Z");
    expect(careCreatedAt("2026-11-23", now).toISOString()).toBe("2026-11-23T05:00:00.000Z");
    expect(careCreatedAt("2026-11-23", new Date("2026-11-23T01:00:00.000Z")).toISOString()).toBe("2026-11-23T01:00:00.000Z");
  });
  it("ghi chú đủ ý + ngày hẹn dd/mm/yyyy", () => {
    const n = careNote({ result: "Đã gửi báo giá", workDone: "Gọi, gửi mail", need: "Thùng carton", nextAction: "Gọi lại", nextActionAt: "2026-11-25" });
    expect(n).toContain("Kết quả: Đã gửi báo giá");
    expect(n).toContain("Việc đã làm: Gọi, gửi mail");
    expect(n).toContain("(hẹn 25/11/2026)");
  });
});

describe("leadCustomerCode", () => {
  it("ổn định theo khoá dòng, trùng thì thêm số", () => {
    const a = leadCustomerCode("SCAN|0123456789", new Set());
    expect(a).toMatch(/^KHM-[0-9A-Z]{6}$/);
    expect(leadCustomerCode("SCAN|0123456789", new Set())).toBe(a);
    expect(leadCustomerCode("SCAN|0123456789", new Set([a]))).toBe(`${a}-2`);
    expect(leadCustomerCode("SCAN|9999999999", new Set())).not.toBe(a);
  });
});
