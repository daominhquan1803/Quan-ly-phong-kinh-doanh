import { describe, it, expect } from "vitest";
import { computeKpiScores } from "./kpi-metrics";

// 3 dòng số liệu mẫu lấy nguyên văn từ file KPI_KD_HoanggiaPS.xlsx (sheet
// KPI_Danh_gia_thang, PHÒNG KINH DOANH 1) — dùng để khoá công thức tính điểm đúng như file
// gốc, tránh sửa nhầm công thức làm lệch kết quả so với thực tế công ty đang áp dụng.

describe("computeKpiScores", () => {
  it("Đào Minh Quân — vượt chỉ tiêu toàn diện, 90 điểm, hạng A", () => {
    const r = computeKpiScores({
      targetRevenue: 1645000000,
      actualRevenue: 1800000000,
      targetRevenueSX: 600000000,
      actualRevenueSX: 895000000,
      targetProfitPct: 3,
      actualProfitPct: 3,
      targetNewCustomers: 1,
      actualNewCustomers: 1,
      debtOverduePct: 25,
      debtCollectionRatePct: 80,
      visitTarget: 10,
      approvedVisitCount: 8,
      defectCount: 0,
      attendanceDays: 26,
      violationCount: 0,
    });
    expect(r.scoreRevenue).toBe(20);
    expect(r.scoreRevenueSX).toBe(10);
    expect(r.scoreProfit).toBe(10);
    expect(r.scoreNewCustomers).toBe(10);
    expect(r.scoreDebtOverdue).toBe(6);
    expect(r.scoreDebtCollection).toBe(8);
    expect(r.scoreCskh).toBe(16);
    expect(r.scoreAttitude).toBe(10);
    expect(r.totalScore).toBe(90);
    expect(r.grade).toBe("A");
  });

  it("Đặng Văn Tấn — chưa có doanh số ghi nhận trong tháng, 60 điểm, hạng D", () => {
    const r = computeKpiScores({
      targetRevenue: 3093642350,
      actualRevenue: 0,
      targetRevenueSX: 800000000,
      actualRevenueSX: 0,
      targetProfitPct: 3,
      actualProfitPct: 3,
      targetNewCustomers: 1,
      actualNewCustomers: 1,
      debtOverduePct: 14,
      debtCollectionRatePct: 90,
      visitTarget: 10,
      approvedVisitCount: 10,
      defectCount: 3,
      attendanceDays: 26,
      violationCount: 0,
    });
    expect(r.scoreRevenue).toBe(0);
    expect(r.scoreRevenueSX).toBe(0);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(9);
    expect(r.scoreCskh).toBe(11);
    expect(r.totalScore).toBe(60);
    expect(r.grade).toBe("D");
  });

  it("Ngô Thanh Tùng — dưới chỉ tiêu nhiều mặt, 53 điểm, hạng F", () => {
    const r = computeKpiScores({
      targetRevenue: 1445000000,
      actualRevenue: 0,
      targetRevenueSX: 400000000,
      actualRevenueSX: 0,
      targetProfitPct: 3,
      actualProfitPct: 3,
      targetNewCustomers: 2,
      actualNewCustomers: 1,
      debtOverduePct: 10,
      debtCollectionRatePct: 70,
      visitTarget: 10,
      approvedVisitCount: 7,
      defectCount: 1,
      attendanceDays: 26,
      violationCount: 0,
    });
    expect(r.scoreNewCustomers).toBe(5);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(7);
    expect(r.scoreCskh).toBe(11);
    expect(r.totalScore).toBe(53);
    expect(r.grade).toBe("F");
  });

  it("bậc thang nợ quá hạn: <15% =10đ, 15-24% =8đ, 25-30% =6đ, >=31% =3đ", () => {
    expect(computeKpiScores({ ...base(), debtOverduePct: 14 }).scoreDebtOverdue).toBe(10);
    expect(computeKpiScores({ ...base(), debtOverduePct: 20 }).scoreDebtOverdue).toBe(8);
    expect(computeKpiScores({ ...base(), debtOverduePct: 25 }).scoreDebtOverdue).toBe(6);
    expect(computeKpiScores({ ...base(), debtOverduePct: 30 }).scoreDebtOverdue).toBe(6);
    expect(computeKpiScores({ ...base(), debtOverduePct: 31 }).scoreDebtOverdue).toBe(3);
  });

  it("không vượt trần điểm dù thực hiện vượt xa chỉ tiêu", () => {
    const r = computeKpiScores({
      ...base(),
      targetRevenue: 100,
      actualRevenue: 1000,
      targetRevenueSX: 100,
      actualRevenueSX: 1000,
      approvedVisitCount: 100,
    });
    expect(r.scoreRevenue).toBe(20);
    expect(r.scoreRevenueSX).toBe(10);
    expect(r.scoreCskh).toBe(20);
  });

  it("chưa nhập chỉ tiêu (null) thì điểm mục đó = 0, không NaN", () => {
    const r = computeKpiScores({
      targetRevenue: 0,
      actualRevenue: 0,
      targetRevenueSX: 0,
      actualRevenueSX: 0,
      targetProfitPct: null,
      actualProfitPct: null,
      targetNewCustomers: null,
      actualNewCustomers: null,
      debtOverduePct: null,
      debtCollectionRatePct: null,
      visitTarget: 8,
      approvedVisitCount: 0,
      defectCount: 0,
      attendanceDays: null,
      violationCount: 0,
    });
    expect(r.totalScore).toBe(0);
    expect(r.grade).toBe("F");
    expect(Number.isNaN(r.totalScore)).toBe(false);
  });
});

function base() {
  return {
    targetRevenue: 1000,
    actualRevenue: 1000,
    targetRevenueSX: 1000,
    actualRevenueSX: 1000,
    targetProfitPct: 3,
    actualProfitPct: 3,
    targetNewCustomers: 1,
    actualNewCustomers: 1,
    debtOverduePct: 0,
    debtCollectionRatePct: 100,
    visitTarget: 10,
    approvedVisitCount: 10,
    defectCount: 0,
    attendanceDays: 26,
    violationCount: 0,
  };
}
