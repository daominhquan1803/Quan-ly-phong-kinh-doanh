import { describe, expect, it } from "vitest";
import { reportComplete, reportScope } from "./trip-report-scope";

const trip = {
  employeeId: "tung",
  stops: [
    { id: "s1", attendeeId: "tung", outcome: null },
    { id: "s2", attendeeId: "dung", outcome: null },
    { id: "s3", attendeeId: null, outcome: null },
  ],
};
const ids = (s: Set<string>) => [...s].sort();

describe("ai nộp báo cáo điểm dừng nào", () => {
  it("người đi gặp chỉ nộp điểm dừng của mình, và phải nộp đủ các điểm dừng đó", () => {
    const s = reportScope(trip, "dung", false);
    expect(ids(s.allowed)).toEqual(["s2"]);
    expect(ids(s.required)).toEqual(["s2"]);
  });
  it("người không có điểm dừng nào thì không nộp được gì", () => {
    expect(reportScope(trip, "ky", false).allowed.size).toBe(0);
  });
  it("chủ đăng ký và admin nộp được mọi điểm dừng, phải nộp đủ điểm dừng chưa có báo cáo của người khác", () => {
    expect(ids(reportScope(trip, "tung", false).allowed)).toEqual(["s1", "s2", "s3"]);
    expect(ids(reportScope(trip, "tung", false).required)).toEqual(["s1", "s2", "s3"]);
    expect(ids(reportScope(trip, "ad", true).required)).toEqual(["s1", "s2", "s3"]);
  });
  it("điểm dừng người khác đã tự báo cáo thì chủ đăng ký không bắt buộc nộp lại", () => {
    const t = { ...trip, stops: [trip.stops[0], { ...trip.stops[1], outcome: "MET" }, trip.stops[2]] };
    expect(ids(reportScope(t, "tung", false).required)).toEqual(["s1", "s3"]);
    expect(ids(reportScope(t, "tung", false).allowed)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("báo cáo đủ chưa", () => {
  it("đủ khi mọi điểm dừng đã có kết quả hoặc vừa được báo cáo", () => {
    const stops = [{ id: "s1", outcome: "MET" }, { id: "s2", outcome: null }];
    expect(reportComplete(stops, new Set(["s2"]))).toBe(true);
    expect(reportComplete(stops, new Set())).toBe(false);
  });
});
