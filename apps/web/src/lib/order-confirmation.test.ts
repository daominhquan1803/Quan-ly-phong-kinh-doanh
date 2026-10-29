import { describe, expect, it } from "vitest";
import { confirmDeadline, confirmInfo, isConfirmError, needsConfirmation } from "./order-confirmation";

// Giờ Việt Nam → Date (UTC+7)
const vn = (s: string) => new Date(`${s}+07:00`);
const base = { source: "AMIS_API", status: "NEW", totalValue: 1_000_000 };

describe("confirmDeadline — 2 giờ làm việc (T2–T7, 7h30–17h30)", () => {
  it("trong giờ: cộng thẳng 2 giờ", () => {
    expect(confirmDeadline(vn("2026-11-03T09:00:00")).toISOString()).toBe(vn("2026-11-03T11:00:00").toISOString());
  });
  it("sát cuối ngày: phần còn lại sang 7h30 hôm sau", () => {
    expect(confirmDeadline(vn("2026-11-03T16:30:00")).toISOString()).toBe(vn("2026-11-04T08:30:00").toISOString());
  });
  it("ngoài giờ (tối/sáng sớm): đếm từ 7h30 ngày làm việc kế tiếp", () => {
    expect(confirmDeadline(vn("2026-11-03T19:00:00")).toISOString()).toBe(vn("2026-11-04T09:30:00").toISOString());
    expect(confirmDeadline(vn("2026-11-04T06:00:00")).toISOString()).toBe(vn("2026-11-04T09:30:00").toISOString());
  });
  it("Thứ Bảy chiều muộn / Chủ nhật: bỏ Chủ nhật, sang Thứ Hai", () => {
    expect(confirmDeadline(vn("2026-11-07T17:00:00")).toISOString()).toBe(vn("2026-11-09T09:00:00").toISOString()); // T7 còn 30p + T2 1g30
    expect(confirmDeadline(vn("2026-11-08T10:00:00")).toISOString()).toBe(vn("2026-11-09T09:30:00").toISOString());
  });
});

describe("confirmInfo / needsConfirmation", () => {
  const created = vn("2026-11-03T09:00:00");
  it("đơn mới chưa xác nhận: còn hạn → PENDING, quá hạn → OVERDUE (lỗi Admin)", () => {
    const o = { ...base, amisCreatedAt: created, confirmedAt: null };
    expect(confirmInfo(o, vn("2026-11-03T10:30:00")).state).toBe("PENDING");
    const late = confirmInfo(o, vn("2026-11-03T11:01:00"));
    expect(late.state).toBe("OVERDUE");
    expect(isConfirmError(late)).toBe(true);
  });
  it("xác nhận kịp hạn → ON_TIME; trễ → LATE (vẫn là lỗi)", () => {
    expect(confirmInfo({ ...base, amisCreatedAt: created, confirmedAt: vn("2026-11-03T10:59:00") }).state).toBe("ON_TIME");
    const l = confirmInfo({ ...base, amisCreatedAt: created, confirmedAt: vn("2026-11-03T14:00:00") });
    expect(l.state).toBe("LATE");
    expect(isConfirmError(l)).toBe(true);
  });
  it("không áp dụng: đơn trước 30/10/2026, đơn huỷ, đơn giá trị 0 (mẫu), đơn không từ AMIS", () => {
    const at = { amisCreatedAt: created, confirmedAt: null };
    expect(needsConfirmation({ ...base, ...at })).toBe(true);
    expect(needsConfirmation({ ...base, amisCreatedAt: vn("2026-10-29T09:00:00") })).toBe(false);
    expect(needsConfirmation({ ...base, ...at, status: "CANCELLED" })).toBe(false);
    expect(needsConfirmation({ ...base, ...at, totalValue: 0 })).toBe(false);
    expect(needsConfirmation({ ...base, ...at, source: "MANUAL" })).toBe(false);
    expect(confirmInfo({ ...base, amisCreatedAt: vn("2026-10-29T09:00:00"), confirmedAt: null }).state).toBe("NA");
  });
  it("đơn cũ nhưng Admin đã xác nhận → DONE (không phải lỗi)", () => {
    const i = confirmInfo({ ...base, amisCreatedAt: vn("2026-10-20T09:00:00"), confirmedAt: vn("2026-11-01T09:00:00") });
    expect(i.state).toBe("DONE");
    expect(isConfirmError(i)).toBe(false);
  });
});
