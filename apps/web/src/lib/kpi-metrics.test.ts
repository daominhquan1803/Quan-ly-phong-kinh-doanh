import { describe, it, expect } from "vitest";
import { computeKpiScores } from "./kpi-metrics";

// Công thức khoá theo file KPI_PKD1_HoanggiaPS.xlsx (cập nhật 26/08) — xem docblock đầu
// lib/kpi-metrics.ts để biết đầy đủ lịch sử thay đổi. Tóm tắt bản hiện hành:
//  - Doanh số tổng / DS ngành Sản xuất: tỷ lệ đạt × trọng số (do Quản trị viên nhập riêng từng
//    người), có thưởng vượt chỉ tiêu từ 110% trở lên — mỗi 5% vượt thêm +1đ, không giới hạn trần.
//  - KH mới / CSKH (Đi gặp KH): tỷ lệ đạt × trọng số, CÓ TRẦN bằng đúng trọng số, KHÔNG thưởng.
//  - Nợ quá hạn / Thu hồi nợ: công thức cũ giữ nguyên, không có trọng số riêng (luôn max 10 mỗi mục).
//  - Thái độ: max(2 − số lần vi phạm, 0), tối đa 2đ — đã bỏ "chuyên cần" và "Giá bán cao".
//  - Điểm tuần: truyền thẳng từ ngoài vào (weekScore), tối đa thường là 8đ (4 tuần × 0-2đ/tuần).

describe("computeKpiScores", () => {
  it("đạt tuyệt đối mọi tiêu chí — 100 điểm, hạng A", () => {
    const r = computeKpiScores({
      targetRevenue: 1000,
      actualRevenue: 1000,
      weightRevenue: 30,
      targetRevenueSX: 350,
      actualRevenueSX: 350,
      weightRevenueSX: 20,
      targetNewCustomers: 1,
      actualNewCustomers: 1,
      weightNewCustomers: 10,
      debtOverduePct: 10,
      debtCollectionRatePct: 100,
      visitTarget: 10,
      approvedVisitCount: 10,
      weightVisit: 10,
      violationCount: 0,
      weekScore: 8,
    });
    expect(r.scoreRevenue).toBe(30);
    expect(r.revenueBonus).toBe(0);
    expect(r.scoreSX).toBe(20);
    expect(r.revenueSXBonus).toBe(0);
    expect(r.scoreNewCustomers).toBe(10);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(10);
    expect(r.scoreVisit).toBe(10);
    expect(r.scoreAttitude).toBe(2);
    expect(r.scoreWeek).toBe(8);
    expect(r.totalScore).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("DS ngành Sản xuất dưới 110% chỉ tiêu — MIN(weight, tỷ lệ đạt × weight), thiếu chỉ tiêu thì 0đ", () => {
    expect(computeKpiScores({ ...base(), targetRevenueSX: 400, actualRevenueSX: 400 }).scoreSX).toBe(20);
    expect(computeKpiScores({ ...base(), targetRevenueSX: 400, actualRevenueSX: 300 }).scoreSX).toBe(15);
    expect(computeKpiScores({ ...base(), targetRevenueSX: 400, actualRevenueSX: 200 }).scoreSX).toBe(10);
    expect(computeKpiScores({ ...base(), targetRevenueSX: 0, actualRevenueSX: 500 }).scoreSX).toBe(0); // chưa có chỉ tiêu — không suy đoán
  });

  it("DS ngành Sản xuất từ 110% chỉ tiêu trở lên — thưởng +1đ mỗi mốc 5% vượt thêm, không giới hạn trần", () => {
    // Đúng 110% — đã có +1đ (tính từ mốc chẵn).
    const r110 = computeKpiScores({ ...base(), targetRevenueSX: 1000, actualRevenueSX: 1100 });
    expect(r110.revenueSXBonus).toBe(2); // 10% vượt / 5% = 2 mốc
    expect(r110.scoreSX).toBe(22);
    // 115% — 3 mốc 5% (110,115) → +3đ.
    const r115 = computeKpiScores({ ...base(), targetRevenueSX: 1000, actualRevenueSX: 1150 });
    expect(r115.revenueSXBonus).toBe(3);
    // 150% — 10 mốc 5% → +10đ.
    expect(computeKpiScores({ ...base(), targetRevenueSX: 1000, actualRevenueSX: 1500 }).revenueSXBonus).toBe(10);
  });

  it("bậc thang nợ quá hạn giữ nguyên: <15% =10đ, 15-24% =8đ, 25-30% =6đ, >=31% =3đ", () => {
    expect(computeKpiScores({ ...base(), debtOverduePct: 14 }).scoreDebtOverdue).toBe(10);
    expect(computeKpiScores({ ...base(), debtOverduePct: 20 }).scoreDebtOverdue).toBe(8);
    expect(computeKpiScores({ ...base(), debtOverduePct: 25 }).scoreDebtOverdue).toBe(6);
    expect(computeKpiScores({ ...base(), debtOverduePct: 30 }).scoreDebtOverdue).toBe(6);
    expect(computeKpiScores({ ...base(), debtOverduePct: 31 }).scoreDebtOverdue).toBe(3);
  });

  it("doanh số dưới 110% chỉ tiêu — không có thưởng, vẫn trần đúng bằng trọng số", () => {
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1090, weightRevenue: 30 }).scoreRevenue).toBe(30);
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1090 }).revenueBonus).toBe(0);
  });

  it("doanh số từ 110% chỉ tiêu trở lên — thưởng +1đ mỗi mốc 5% vượt thêm, không giới hạn trần", () => {
    const r110 = computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1100, weightRevenue: 30 });
    expect(r110.revenueBonus).toBe(2); // 10%/5% = 2 mốc
    expect(r110.scoreRevenue).toBe(32);
    // 112% — chưa đủ mốc 115%, vẫn 2 mốc (110,112 chưa tới 115).
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1120, weightRevenue: 30 }).revenueBonus).toBe(2);
    // 120% — 4 mốc 5% (110,115,120 — 20/5=4) → +4đ.
    const r120 = computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1200, weightRevenue: 30 });
    expect(r120.revenueBonus).toBe(4);
    expect(r120.scoreRevenue).toBe(34);
    // Vượt rất xa (1000%) — thưởng vẫn cộng dồn không trần.
    const rHuge = computeKpiScores({ ...base(), targetRevenue: 100, actualRevenue: 1000, weightRevenue: 30 });
    expect(rHuge.revenueBonus).toBe(180); // 900% vượt / 5% = 180 mốc
    expect(rHuge.scoreRevenue).toBe(210);
  });

  it("KH mới và CSKH/Đi gặp KH — có trần đúng bằng trọng số, KHÔNG có thưởng vượt", () => {
    expect(computeKpiScores({ ...base(), targetNewCustomers: 4, actualNewCustomers: 6, weightNewCustomers: 10 }).scoreNewCustomers).toBe(10); // 150% vẫn chặn ở 10
    expect(computeKpiScores({ ...base(), visitTarget: 10, approvedVisitCount: 13, weightVisit: 10 }).scoreVisit).toBe(10); // 130% vẫn chặn ở 10
  });

  it("thái độ = max(2 − số lần vi phạm, 0), bỏ hẳn chuyên cần", () => {
    expect(computeKpiScores({ ...base(), violationCount: 0 }).scoreAttitude).toBe(2);
    expect(computeKpiScores({ ...base(), violationCount: 1 }).scoreAttitude).toBe(1);
    expect(computeKpiScores({ ...base(), violationCount: 2 }).scoreAttitude).toBe(0);
    expect(computeKpiScores({ ...base(), violationCount: 5 }).scoreAttitude).toBe(0); // không âm
  });

  it("điểm tuần truyền thẳng từ ngoài vào, cộng nguyên vào tổng", () => {
    expect(computeKpiScores({ ...base(), weekScore: 0 }).scoreWeek).toBe(0);
    expect(computeKpiScores({ ...base(), weekScore: 6 }).scoreWeek).toBe(6);
  });

  it("chưa nhập chỉ tiêu (null/0) thì điểm mục đó = 0, không NaN", () => {
    const r = computeKpiScores({
      targetRevenue: 0,
      actualRevenue: 0,
      weightRevenue: 30,
      targetRevenueSX: 0,
      actualRevenueSX: 0,
      weightRevenueSX: 20,
      targetNewCustomers: null,
      actualNewCustomers: null,
      weightNewCustomers: 10,
      debtOverduePct: null,
      debtCollectionRatePct: null,
      visitTarget: 8,
      approvedVisitCount: 0,
      weightVisit: 10,
      violationCount: 0,
      weekScore: 0,
    });
    expect(r.totalScore).toBe(2); // chỉ còn điểm thái độ mặc định (0 vi phạm = 2đ)
    expect(r.grade).toBe("F");
    expect(Number.isNaN(r.totalScore)).toBe(false);
  });

  it("chưa đạt nhiều mặt — cộng đúng tổng và xếp hạng theo bậc thang", () => {
    const r = computeKpiScores({
      targetRevenue: 1445000000,
      actualRevenue: 0,
      weightRevenue: 30,
      targetRevenueSX: 600000000,
      actualRevenueSX: 380000000,
      weightRevenueSX: 20,
      targetNewCustomers: 2,
      actualNewCustomers: 1,
      weightNewCustomers: 10,
      debtOverduePct: 10,
      debtCollectionRatePct: 70,
      visitTarget: 10,
      approvedVisitCount: 7,
      weightVisit: 10,
      violationCount: 0,
      weekScore: 5,
    });
    expect(r.scoreRevenue).toBe(0);
    expect(r.scoreSX).toBe(12.7); // 380/600 = 63.3% × 20 = 12.66... → làm tròn 1 số thập phân
    expect(r.scoreNewCustomers).toBe(5);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(7);
    expect(r.scoreVisit).toBe(7); // 7/10 × 10 = 7
    expect(r.scoreAttitude).toBe(2);
    expect(r.scoreWeek).toBe(5);
    expect(r.totalScore).toBe(48.7);
    expect(r.grade).toBe("F");
  });

  it("xếp hạng theo đúng bậc thang không đổi: A>=90, B>=80, C>=70, D>=60, F<60", () => {
    expect(computeKpiScores({ ...base(), weekScore: 8 }).grade).toBe("A"); // đủ 100
    // Tổng = 30+20+10+10+5+10+1+0 = 86 -> hạng B (80-89).
    const r = computeKpiScores({ ...base(), weekScore: 0, violationCount: 1, debtCollectionRatePct: 50 });
    expect(r.totalScore).toBe(86);
    expect(r.grade).toBe("B");
  });
});

function base() {
  return {
    targetRevenue: 1000,
    actualRevenue: 1000,
    weightRevenue: 30,
    targetRevenueSX: 350,
    actualRevenueSX: 350,
    weightRevenueSX: 20,
    targetNewCustomers: 1,
    actualNewCustomers: 1,
    weightNewCustomers: 10,
    debtOverduePct: 0,
    debtCollectionRatePct: 100,
    visitTarget: 10,
    approvedVisitCount: 10,
    weightVisit: 10,
    violationCount: 0,
    weekScore: 8,
  };
}
