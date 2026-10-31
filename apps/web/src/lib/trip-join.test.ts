import { describe, expect, it } from "vitest";
import { joinDenied } from "./trip-join";

const ctx = (o: object) => ({ callerId: "dung", isAdmin: false, tripOwnerId: "tung", customerOwnerId: "dung", attendeeId: "dung", ...o });

describe("ai được thêm khách vào chuyến công tác", () => {
  it("NVKD phụ trách khách tự tham gia hoặc nhờ người khác đi hộ", () => {
    expect(joinDenied(ctx({}))).toBeNull();
    expect(joinDenied(ctx({ attendeeId: "tung" }))).toBeNull();
  });
  it("người đăng ký chuyến thêm khách của đồng nghiệp vào chuyến của mình (người đi = mình)", () => {
    expect(joinDenied(ctx({ callerId: "tung", customerOwnerId: "dung", attendeeId: "tung" }))).toBeNull();
  });
  it("người đăng ký chuyến không được chỉ định người khác đi gặp khách của đồng nghiệp", () => {
    expect(joinDenied(ctx({ callerId: "tung", customerOwnerId: "dung", attendeeId: "ky" }))).not.toBeNull();
  });
  it("khách chưa phân: ai cũng nhận được cho chính mình, không nhận hộ người khác", () => {
    expect(joinDenied(ctx({ callerId: "ky", customerOwnerId: null, attendeeId: "ky" }))).toBeNull();
    expect(joinDenied(ctx({ callerId: "ky", customerOwnerId: null, attendeeId: "dung" }))).not.toBeNull();
  });
  it("người không liên quan không thêm được; admin thêm được mọi trường hợp", () => {
    expect(joinDenied(ctx({ callerId: "ky", customerOwnerId: "dung", attendeeId: "ky" }))).not.toBeNull();
    expect(joinDenied(ctx({ callerId: "ad", isAdmin: true, customerOwnerId: "dung", attendeeId: "ky" }))).toBeNull();
  });
});
