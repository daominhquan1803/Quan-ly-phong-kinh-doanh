import { describe, it, expect } from "vitest";
import { planAssign } from "./debt-unmatched-assign";

describe("planAssign", () => {
  it("mặc định gắn min(chưa khớp, còn phải thu); hết tiền -> MATCHED", () => {
    expect(planAssign(56_700_000, 60_000_000)).toEqual({ ok: true, amount: 56_700_000, newStatus: "MATCHED" });
  });

  it("hoá đơn còn ít hơn tiền chưa khớp -> gắn phần còn phải thu, khoản tiền về còn PARTIAL", () => {
    expect(planAssign(23_220_000, 10_000_000)).toEqual({ ok: true, amount: 10_000_000, newStatus: "PARTIAL" });
  });

  it("nhập số tiền tay nhỏ hơn -> PARTIAL; đúng bằng phần chưa khớp -> MATCHED", () => {
    expect(planAssign(20_000_000, 50_000_000, 5_000_000)).toEqual({ ok: true, amount: 5_000_000, newStatus: "PARTIAL" });
    expect(planAssign(20_000_000, 50_000_000, 20_000_000)).toEqual({ ok: true, amount: 20_000_000, newStatus: "MATCHED" });
  });

  it("từ chối: vượt chưa khớp, vượt còn phải thu, số <= 0, hoá đơn đã thu đủ, tiền đã khớp hết", () => {
    expect(planAssign(1_000_000, 5_000_000, 2_000_000).ok).toBe(false);
    expect(planAssign(5_000_000, 1_000_000, 2_000_000).ok).toBe(false);
    expect(planAssign(5_000_000, 5_000_000, 0).ok).toBe(false);
    expect(planAssign(5_000_000, 0).ok).toBe(false);
    expect(planAssign(0, 5_000_000).ok).toBe(false);
  });

  it("chịu sai số làm tròn 0,5đ", () => {
    expect(planAssign(1_000_000.3, 1_000_000, 1_000_000.3).ok).toBe(true);
  });
});
