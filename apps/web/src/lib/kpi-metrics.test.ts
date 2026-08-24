import { describe, it, expect } from "vitest";
import { computeKpiScores } from "./kpi-metrics";

// Công thức khoá theo file KPI_KD_HoanggiaPS.xlsx, đã qua 3 lần cập nhật anh Quân gửi lại:
// (1) "DS Sản xuất" (tỷ lệ) → "Cơ cấu ngành hàng TM/SX" (mức lệch so với chỉ tiêu cố định
// 65/35); "Lợi nhuận" (%) → "Giá bán cao" (số mã hàng bán cao hơn giá SX báo ≥3%). (2) Doanh số
// tổng có thêm thưởng vượt chỉ tiêu — từ 110% trở lên, mỗi 10% vượt thêm +1đ, không giới hạn
// trần. (3) Đổi LẠI đầu điểm #2 — từ "Cơ cấu ngành hàng" (mức lệch so với 65/35) sang thuần tỷ lệ
// đạt DS ngành Sản xuất (thực tế/chỉ tiêu riêng SX, không còn liên quan Thương mại), cùng công
// thức + cơ chế thưởng >110% như Doanh số tổng. 6 đầu điểm còn lại giữ nguyên công thức như trước.

describe("computeKpiScores", () => {
  it("đạt tuyệt đối mọi tiêu chí — 100 điểm, hạng A", () => {
    const r = computeKpiScores({
      targetRevenue: 1000,
      actualRevenue: 1000,
      targetRevenueSX: 350,
      actualRevenueSX: 350,
      targetHighPriceSkuCount: 8,
      actualHighPriceSkuCount: 8,
      targetNewCustomers: 1,
      actualNewCustomers: 1,
      debtOverduePct: 10,
      debtCollectionRatePct: 100,
      visitTarget: 10,
      approvedVisitCount: 10,
      defectCount: 0,
      attendanceDays: 26,
      violationCount: 0,
    });
    expect(r.scoreRevenue).toBe(20);
    expect(r.revenueBonus).toBe(0);
    expect(r.scoreSX).toBe(10);
    expect(r.revenueSXBonus).toBe(0);
    expect(r.scoreHighPrice).toBe(10);
    expect(r.scoreNewCustomers).toBe(10);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(10);
    expect(r.scoreCskh).toBe(20);
    expect(r.scoreAttitude).toBe(10);
    expect(r.totalScore).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("DS ngành Sản xuất dưới 110% chỉ tiêu — MIN(10, tỷ lệ đạt × 10), thiếu chỉ tiêu thì 0đ", () => {
    expect(computeKpiScores({ ...base(), targetRevenueSX: 400, actualRevenueSX: 400 }).scoreSX).toBe(10);
    expect(computeKpiScores({ ...base(), targetRevenueSX: 400, actualRevenueSX: 300 }).scoreSX).toBe(7.5);
    expect(computeKpiScores({ ...base(), targetRevenueSX: 400, actualRevenueSX: 200 }).scoreSX).toBe(5);
    expect(computeKpiScores({ ...base(), targetRevenueSX: 0, actualRevenueSX: 500 }).scoreSX).toBe(0); // chưa có chỉ tiêu — không suy đoán
  });

  it("DS ngành Sản xuất từ 110% chỉ tiêu trở lên — thưởng +1đ mỗi mốc 10% vượt thêm, không giới hạn trần", () => {
    // Đúng 110% — đã có +1đ (tính từ mốc chẵn).
    const r110 = computeKpiScores({ ...base(), targetRevenueSX: 1000, actualRevenueSX: 1100 });
    expect(r110.revenueSXBonus).toBe(1);
    expect(r110.scoreSX).toBe(11);
    // 120% — 2 mốc 10% → +2đ.
    const r120 = computeKpiScores({ ...base(), targetRevenueSX: 1000, actualRevenueSX: 1200 });
    expect(r120.revenueSXBonus).toBe(2);
    expect(r120.scoreSX).toBe(12);
    // 150% — 5 mốc → +5đ.
    expect(computeKpiScores({ ...base(), targetRevenueSX: 1000, actualRevenueSX: 1500 }).revenueSXBonus).toBe(5);
  });

  it("giá bán cao — MIN(10, số mã hàng thực tế / chỉ tiêu × 10), thiếu chỉ tiêu thì 0đ", () => {
    expect(computeKpiScores({ ...base(), targetHighPriceSkuCount: 8, actualHighPriceSkuCount: 8 }).scoreHighPrice).toBe(10);
    expect(computeKpiScores({ ...base(), targetHighPriceSkuCount: 10, actualHighPriceSkuCount: 6 }).scoreHighPrice).toBe(6);
    // Vượt chỉ tiêu vẫn không quá trần 10đ.
    expect(computeKpiScores({ ...base(), targetHighPriceSkuCount: 4, actualHighPriceSkuCount: 20 }).scoreHighPrice).toBe(10);
    expect(computeKpiScores({ ...base(), targetHighPriceSkuCount: null, actualHighPriceSkuCount: 5 }).scoreHighPrice).toBe(0);
  });

  it("bậc thang nợ quá hạn: <15% =10đ, 15-24% =8đ, 25-30% =6đ, >=31% =3đ", () => {
    expect(computeKpiScores({ ...base(), debtOverduePct: 14 }).scoreDebtOverdue).toBe(10);
    expect(computeKpiScores({ ...base(), debtOverduePct: 20 }).scoreDebtOverdue).toBe(8);
    expect(computeKpiScores({ ...base(), debtOverduePct: 25 }).scoreDebtOverdue).toBe(6);
    expect(computeKpiScores({ ...base(), debtOverduePct: 30 }).scoreDebtOverdue).toBe(6);
    expect(computeKpiScores({ ...base(), debtOverduePct: 31 }).scoreDebtOverdue).toBe(3);
  });

  it("doanh số dưới 110% chỉ tiêu — không có thưởng, vẫn trần ở 20đ như cũ", () => {
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1090 }).scoreRevenue).toBe(20);
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1090 }).revenueBonus).toBe(0);
  });

  it("doanh số từ 110% chỉ tiêu trở lên — thưởng +1đ mỗi mốc 10% vượt thêm, không giới hạn trần", () => {
    // Đúng 110% — đã có +1đ (tính từ mốc chẵn, không cần vượt qua mới tính).
    const r110 = computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1100 });
    expect(r110.revenueBonus).toBe(1);
    expect(r110.scoreRevenue).toBe(21);
    // 115% — chưa đủ mốc 120%, vẫn +1đ.
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1150 }).revenueBonus).toBe(1);
    // 120% — 2 mốc 10% (110%, 120%) → +2đ.
    const r120 = computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1200 });
    expect(r120.revenueBonus).toBe(2);
    expect(r120.scoreRevenue).toBe(22);
    // 150% — 5 mốc → +5đ.
    expect(computeKpiScores({ ...base(), targetRevenue: 1000, actualRevenue: 1500 }).revenueBonus).toBe(5);
    // Vượt rất xa (1000%) — thưởng vẫn cộng dồn không trần, đẩy cả Điểm DS và Điểm tổng vượt mức
    // tối đa thông thường (khác CSKH/6 đầu điểm còn lại vẫn giữ trần).
    const rHuge = computeKpiScores({ ...base(), targetRevenue: 100, actualRevenue: 1000, approvedVisitCount: 100 });
    expect(rHuge.revenueBonus).toBe(90);
    expect(rHuge.scoreRevenue).toBe(110);
    expect(rHuge.scoreCskh).toBe(20); // CSKH vẫn giữ trần 20đ như cũ, không có cơ chế thưởng
  });

  it("chưa nhập chỉ tiêu (null) thì điểm mục đó = 0, không NaN", () => {
    const r = computeKpiScores({
      targetRevenue: 0,
      actualRevenue: 0,
      targetRevenueSX: 0,
      actualRevenueSX: 0,
      targetHighPriceSkuCount: null,
      actualHighPriceSkuCount: null,
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

  it("chưa đạt nhiều mặt — cộng đúng tổng và xếp hạng theo bậc thang", () => {
    const r = computeKpiScores({
      targetRevenue: 1445000000,
      actualRevenue: 0,
      targetRevenueSX: 600000000,
      actualRevenueSX: 380000000,
      targetHighPriceSkuCount: 10,
      actualHighPriceSkuCount: 6,
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
    expect(r.scoreRevenue).toBe(0);
    expect(r.scoreSX).toBe(6.3); // 380/600 = 63.3% × 10 = 6.33... → làm tròn 1 số thập phân
    expect(r.scoreHighPrice).toBe(6);
    expect(r.scoreNewCustomers).toBe(5);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(7);
    expect(r.scoreCskh).toBe(11); // (7/10)*20 - 1*3 = 14-3
    expect(r.scoreAttitude).toBe(10);
    expect(r.totalScore).toBe(55.3);
    expect(r.grade).toBe("F");
  });
});

function base() {
  return {
    targetRevenue: 1000,
    actualRevenue: 1000,
    targetRevenueSX: 350,
    actualRevenueSX: 350,
    targetHighPriceSkuCount: 8,
    actualHighPriceSkuCount: 8,
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
