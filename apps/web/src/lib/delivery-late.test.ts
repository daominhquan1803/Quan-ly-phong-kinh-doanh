import { describe, it, expect } from "vitest";
import { closedInTime, onTimeRate, type RateLine } from "./delivery-late";

const vn = (s: string) => new Date(`${s}+07:00`);
const due = vn("2026-11-10T00:00:00");
const line = (o: Partial<RateLine> = {}): RateLine => ({ dueOn: due, isOpen: false, poQuantity: 100, deliveredQty: 100, lastDeliveryOn: vn("2026-11-10T15:00:00"), oldPo: false, ...o });
const rate = (lines: RateLine[]) => onTimeRate(lines, vn("2026-09-01T00:00:00"), vn("2026-11-28T08:00:00"));
const closed = (at: string, by: string | null = "u1") => ({ manuallyClosed: true, manuallyClosedAt: vn(at), manuallyClosedByUserId: by, deliveredQty: 0, lastDeliveryOn: null });

describe("closedInTime", () => {
  it("đóng đúng ngày hạn hoặc app tự đóng thì tính là đóng kịp hạn; đóng sau hạn thì không", () => {
    expect(closedInTime(closed("2026-11-10T23:00:00"), due)).toBe(true);
    expect(closedInTime(closed("2026-11-20T09:00:00", null), due)).toBe(true);
    expect(closedInTime(closed("2026-11-11T00:00:00"), due)).toBe(false);
    expect(closedInTime({ manuallyClosed: false }, due)).toBe(false);
  });
});

describe("onTimeRate", () => {
  it("giao trong ngày hạn là đúng hạn; dòng quá hạn còn mở và dòng đóng sau hạn là chưa đúng hạn", () => {
    expect(rate([line(), line({ isOpen: true, deliveredQty: 0 }), line(closed("2026-11-15T09:00:00"))])).toEqual({ onTime: 1, total: 3, pct: 33 });
  });

  it("THẤT BẠI: đóng trước hạn, PO cũ, chưa tới hạn, thiếu đợt giao -> không đưa vào mẫu", () => {
    expect(
      rate([line(closed("2026-11-05T09:00:00")), line({ isOpen: true, oldPo: true }), line({ dueOn: vn("2026-11-28T00:00:00") }), line({ lastDeliveryOn: null }), line({ dueOn: null })])
    ).toEqual({ onTime: 0, total: 0, pct: null });
  });
});
