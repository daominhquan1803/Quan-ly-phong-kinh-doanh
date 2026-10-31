import { describe, expect, it } from "vitest";
import { summarizeOpenDefects } from "./defect-open-summary";

describe("summarizeOpenDefects", () => {
  it("đếm tổng, chưa phản hồi khách, đang đổi dở", () => {
    const r = summarizeOpenDefects([
      { respondedAt: null, replacements: [] },
      { respondedAt: "2026-10-30T01:00:00Z", replacements: [{}] },
      { respondedAt: "2026-10-30T01:00:00Z", replacements: [] },
    ]);
    expect(r).toEqual({ total: 3, unresponded: 1, partlyReplaced: 1 });
  });
  it("không có biên bản mở", () => {
    expect(summarizeOpenDefects([])).toEqual({ total: 0, unresponded: 0, partlyReplaced: 0 });
  });
});
