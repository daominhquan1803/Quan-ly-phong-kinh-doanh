import { describe, expect, it } from "vitest";
import { entryCounts, isPhone, missingFields, validateNewEntry, WEEK_ENTRY_COMPLETE_FROM, type EntryFields } from "./week-plan-entry";

const after = new Date("2026-10-27T03:00:00Z");
const before = new Date("2026-10-20T03:00:00Z");
const full: EntryFields = {
  entryDate: after,
  customerName: "Công ty ABC",
  address: "KCN Quế Võ, Bắc Ninh",
  nationality: "Hàn Quốc",
  scale: "50_200",
  contactName: "Chị Lan",
  contactPhone: "0912 345 678",
  need: "Tem decal 5.000 cái/tháng",
  workDone: "Gọi điện, gửi catalogue",
  nextAction: "Gửi báo giá",
  nextActionAt: new Date("2026-10-30T00:00:00Z"),
};

describe("dòng khách liên hệ mới phải đủ thông tin", () => {
  it("đủ 10 mục thì tính", () => {
    expect(missingFields(full)).toEqual([]);
    expect(entryCounts(full)).toBe(true);
  });
  it("thiếu mục nào báo đúng mục đó và không tính", () => {
    const e = { ...full, scale: null, nextActionAt: null, need: "  " };
    expect(missingFields(e)).toEqual(["quy mô", "nhu cầu", "ngày hẹn nhắc"]);
    expect(entryCounts(e)).toBe(false);
  });
  it("SĐT sai định dạng coi như thiếu", () => {
    expect(isPhone("0912 345 678")).toBe(true);
    expect(isPhone("+82 10-1234-5678")).toBe(true);
    expect(isPhone("abc")).toBe(false);
    expect(isPhone("123")).toBe(false);
    expect(missingFields({ ...full, contactPhone: "chưa có" })).toEqual(["số điện thoại"]);
  });
  it("dòng trước mốc 26/10/2026 luôn tính dù thiếu thông tin", () => {
    const old: EntryFields = { ...full, entryDate: before, address: null, nationality: null, need: null };
    expect(entryCounts(old)).toBe(true);
    expect(WEEK_ENTRY_COMPLETE_FROM.toISOString()).toBe("2026-10-25T17:00:00.000Z");
  });
});

describe("validateNewEntry", () => {
  const input = { address: "x", nationality: "Việt Nam" as const, scale: "LT50", contactName: "A", contactPhone: "0912345678", need: "n", workDone: "w", nextAction: "a", nextActionAt: "2026-10-30" };
  it("từ chối khi thiếu, nêu rõ mục thiếu", () => {
    expect(validateNewEntry(after, "Cty", { ...input, need: "" })).toBe("Chưa đủ thông tin: thiếu nhu cầu");
  });
  it("cho qua khi đủ; ngày hẹn không được trước ngày ghi", () => {
    expect(validateNewEntry(after, "Cty", input)).toBeNull();
    expect(validateNewEntry(after, "Cty", { ...input, nextActionAt: "2026-10-01" })).toBe("Ngày hẹn nhắc không được trước ngày ghi nhận");
  });
  it("dòng ghi bù cho ngày cũ không bị ép đủ", () => {
    expect(validateNewEntry(before, "Cty", {})).toBeNull();
  });
});
