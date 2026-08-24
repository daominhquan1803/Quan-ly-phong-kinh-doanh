import { describe, it, expect } from "vitest";
import { computeKpiScores } from "./kpi-metrics";

// Công thức khoá theo file KPI_KD_HoanggiaPS.xlsx, đã qua 2 lần cập nhật anh Quân gửi lại:
// (1) "Cơ cấu ngành hàng TM/SX" (mức lệch % so với chỉ tiêu cố định 65% TM / 35% SX, xem sheet
// Huong_dan mục 16) thay cho "DS Sản xuất" cũ; "Giá bán cao" (số mã hàng bán cao hơn giá SX báo
// ≥3%) thay cho "Lợi nhuận" (%) cũ. (2) Doanh số tổng có thêm thưởng vượt chỉ tiêu — từ 110% trở
// lên, mỗi 10% vượt thêm +1đ, không giới hạn trần (xem sheet Thang_diem_va_xep_loai mục 1a). 6
// đầu điểm còn lại giữ nguyên công thức như trước.

describe("computeKpiScores", () => {
  it("đạt tuyệt đối mọi tiêu chí — 100 điểm, hạng A", () => {
    const r = computeKpiScores({
      targetRevenue: 1000,
      actualRevenue: 1000,
      actualRevenueSX: 350,
      actualRevenueTM: 650, // đúng 35% SX — khớp chỉ tiêu cơ cấu, lệch 0
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
    expect(r.actualMixSXPct).toBe(35);
    expect(r.mixDeviationPct).toBe(0);
    expect(r.scoreMix).toBe(10);
    expect(r.scoreHighPrice).toBe(10);
    expect(r.scoreNewCustomers).toBe(10);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(10);
    expect(r.scoreCskh).toBe(20);
    expect(r.scoreAttitude).toBe(10);
    expect(r.totalScore).toBe(100);
    expect(r.grade).toBe("A");
  });

  it("cơ cấu ngành hàng — chấm theo mức lệch so với chỉ tiêu 35% SX: ≤5%→10đ, 5-10%→7đ, 10-15%→3đ, >15%→0đ", () => {
    // 40% SX — lệch đúng 5% (biên trên của bậc đầu) → vẫn 10đ.
    expect(computeKpiScores({ ...base(), actualRevenueSX: 400, actualRevenueTM: 600 }).scoreMix).toBe(10);
    // 42% SX — lệch 7% → 7đ.
    expect(computeKpiScores({ ...base(), actualRevenueSX: 420, actualRevenueTM: 580 }).scoreMix).toBe(7);
    // 47% SX — lệch 12% → 3đ.
    expect(computeKpiScores({ ...base(), actualRevenueSX: 470, actualRevenueTM: 530 }).scoreMix).toBe(3);
    // 60% SX — lệch 25% → 0đ.
    expect(computeKpiScores({ ...base(), actualRevenueSX: 600, actualRevenueTM: 400 }).scoreMix).toBe(0);
    // Lệch về phía Thương mại (SX thấp hơn chỉ tiêu) cũng tính theo trị tuyệt đối — 20% SX,
    // lệch 15% (đúng biên) → vẫn còn 3đ, không phải 0.
    expect(computeKpiScores({ ...base(), actualRevenueSX: 200, actualRevenueTM: 800 }).scoreMix).toBe(3);
    // Chưa có doanh số nhóm nào (0/0) — không suy đoán, 0đ.
    expect(computeKpiScores({ ...base(), actualRevenueSX: 0, actualRevenueTM: 0 }).scoreMix).toBe(0);
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
      actualRevenueSX: 0,
      actualRevenueTM: 0,
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
      actualRevenueSX: 0,
      actualRevenueTM: 0,
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
    expect(r.scoreMix).toBe(0); // 0/0 doanh số nhóm — chưa có dữ liệu
    expect(r.scoreHighPrice).toBe(6);
    expect(r.scoreNewCustomers).toBe(5);
    expect(r.scoreDebtOverdue).toBe(10);
    expect(r.scoreDebtCollection).toBe(7);
    expect(r.scoreCskh).toBe(11); // (7/10)*20 - 1*3 = 14-3
    expect(r.scoreAttitude).toBe(10);
    expect(r.totalScore).toBe(49);
    expect(r.grade).toBe("F");
  });
});

function base() {
  return {
    targetRevenue: 1000,
    actualRevenue: 1000,
    actualRevenueSX: 350,
    actualRevenueTM: 650,
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
