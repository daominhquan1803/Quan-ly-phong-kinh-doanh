import { describe, expect, it } from "vitest";
import { creditsOfStops } from "./trip-credit";

const visit = new Date("2026-11-02T00:00:00+07:00");
const stop = (o: object) => ({ id: "s", companyName: "Cty", content: "x", attendeeId: "tung", supporters: [] as { employeeId: string }[], trip: { visitDate: visit }, ...o });

describe("điểm gặp khách theo điểm dừng", () => {
  it("ví dụ Tùng + Dung: Tùng đi khách 1 và hỗ trợ khách 2 của Dung → Tùng 2 điểm, Dung 1 điểm", () => {
    const credits = creditsOfStops([
      stop({ id: "s1", companyName: "Khách của Tùng", attendeeId: "tung" }),
      stop({ id: "s2", companyName: "Khách của Dung", attendeeId: "dung", supporters: [{ employeeId: "tung" }] }),
    ]);
    const by = (id: string) => credits.filter((c) => c.employeeId === id).map((c) => c.stopId).sort();
    expect(by("tung")).toEqual(["s1", "s2"]);
    expect(by("dung")).toEqual(["s2"]);
  });
  it("người hỗ trợ cả 2 điểm dừng được 2 điểm; người đi gặp không tự thành người hỗ trợ", () => {
    const credits = creditsOfStops([
      stop({ id: "s1", attendeeId: "tung", supporters: [{ employeeId: "ky" }] }),
      stop({ id: "s2", attendeeId: "dung", supporters: [{ employeeId: "ky" }] }),
    ]);
    expect(credits.filter((c) => c.employeeId === "ky")).toHaveLength(2);
    expect(credits.filter((c) => c.employeeId === "tung")).toHaveLength(1);
  });
  it("cùng 1 người vừa đi gặp vừa nằm trong danh sách hỗ trợ chỉ tính 1 điểm cho điểm dừng đó", () => {
    const credits = creditsOfStops([stop({ attendeeId: "tung", supporters: [{ employeeId: "tung" }] })]);
    expect(credits).toHaveLength(1);
  });
  it("lọc theo danh sách nhân viên", () => {
    const credits = creditsOfStops([stop({ attendeeId: "dung", supporters: [{ employeeId: "tung" }] })], ["tung"]);
    expect(credits.map((c) => c.employeeId)).toEqual(["tung"]);
  });
  it("mang theo ngày đi, tên công ty và nội dung", () => {
    expect(creditsOfStops([stop({ companyName: "Rise", content: "báo giá" })])[0]).toMatchObject({ visitDate: visit, companyName: "Rise", content: "báo giá" });
  });
});
