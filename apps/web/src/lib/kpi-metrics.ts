import { prisma } from "@hoanggia/db";
import { monthRange, getEmployeeTargetVsActual, getProductGroupTargetVsActual } from "./dashboard-metrics";
import { getMonthlyWeekPlanScore } from "./week-plan";

/**
 * Công thức tính điểm KPI hàng tháng — dựa theo file mẫu KPI_KD_HoanggiaPS.xlsx / KPI_PKD1_
 * HoanggiaPS.xlsx (sheet KPI_Danh_gia_thang + Thang_diem_va_xep_loai). Lịch sử cập nhật:
 *  - Lần 1-3 (trước 26/08): xem lịch sử cũ trong git log — đã đổi qua lại "Cơ cấu ngành hàng"
 *    ↔ "DS ngành Sản xuất" và thêm thưởng vượt chỉ tiêu Doanh số.
 *  - Lần 4 (26/08, file KPI_PKD1_HoanggiaPS.xlsx): đổi CẢ CƠ CẤU CHỈ TIÊU —
 *      + BỎ HẲN "Giá bán cao" (không còn cột nào trong file mới).
 *      + BỎ HẲN "Chuyên cần" khỏi Thái độ & kỷ luật — giờ Thái độ chỉ còn tối đa 2đ, tính thuần
 *        theo số lần vi phạm: max(2 − số lần vi phạm, 0).
 *      + BỎ trừ điểm "hàng lỗi" (DefectReport) khỏi CSKH/Đi gặp KH — giờ tính thuần tỷ lệ đạt ×
 *        trọng số, có trần, KHÔNG có thưởng vượt (khác Doanh số/DS SX). DefectReport vẫn giữ lại
 *        trong app để ghi nhận/theo dõi, chỉ không dùng để trừ điểm KPI nữa.
 *      + Doanh số tổng, DS ngành Sản xuất, KH mới, CSKH/Đi gặp KH giờ dùng TRỌNG SỐ do Quản trị
 *        viên tự phân bổ RIÊNG CHO TỪNG NHÂN VIÊN mỗi tháng (tuỳ định hướng phát triển từng
 *        người) — mặc định 30/20/10/10, nhưng có thể đổi miễn tổng 4 trọng số này luôn = 70
 *        (giữ đúng thang 100 chung, vì 30 điểm còn lại — Nợ quá hạn 10 + Thu hồi nợ 10 + Thái độ
 *        2 + Điểm tuần 8 — vẫn cố định, không có trọng số riêng).
 *      + Mốc thưởng vượt chỉ tiêu (Doanh số tổng + DS ngành Sản xuất) đổi từ "mỗi 10% vượt thêm
 *        +1đ" xuống "mỗi 5% vượt thêm +1đ" (vẫn bắt đầu tính từ 110% chỉ tiêu, không giới hạn
 *        trần) — áp dụng CẢ 2 mục như nhau.
 *      + Thêm đầu điểm MỚI "Điểm tuần" (tối đa 8đ, = tổng 4 "Điểm tuần" 0/1/2 của Kế hoạch làm
 *        việc tuần trong đúng tháng đó — xem lib/week-plan.ts).
 *
 * Tổng 100 điểm, 8 đầu điểm:
 *  1. Doanh số tổng     tối đa = weightRevenue (mặc định 30, +thưởng vượt 110% mỗi 5% +1đ, không trần) — tự động, từ SalesTarget
 *  2. DS ngành Sản xuất tối đa = weightRevenueSX (mặc định 20, +thưởng như trên)             — tự động, từ SalesPlanLine nhóm Sản xuất
 *  3. KH mới            tối đa = weightNewCustomers (mặc định 10) — MIN(weight, tỷ lệ đạt × weight) — nhập tay
 *  4. CSKH/Đi gặp KH    tối đa = weightVisit (mặc định 10) — MIN(weight, tỷ lệ đạt gặp KH × weight) — tự động, từ BusinessTripRequest
 *  5. Nợ quá hạn        tối đa 10đ — bậc thang theo % (KHÔNG có trọng số riêng)     — nhập tay (chờ nối congno.hienvi.me)
 *  6. Thu hồi nợ        tối đa 10đ — MIN(10, tỷ lệ thu hồi × 10) (KHÔNG có trọng số riêng) — nhập tay
 *  7. Thái độ & kỷ luật tối đa 2đ  — max(2 − số lần vi phạm, 0)                      — nhập tay
 *  8. Điểm tuần         tối đa 8đ  — tổng 4 "Điểm tuần" (0/1/2) của Kế hoạch làm việc tuần trong tháng — tự động
 *
 * weightRevenue + weightRevenueSX + weightNewCustomers + weightVisit LUÔN phải = 70 (không ép ở
 * tầng hàm tính điểm — chỉ cảnh báo ở API/UI — vì đây là số Quản trị viên tự nhập, có thể tạm
 * thời sai trước khi kịp sửa).
 */

export type KpiGrade = "A" | "B" | "C" | "D" | "F";

// Tổng 4 trọng số linh hoạt (Doanh số/DS SX/KH mới/CSKH) phải luôn bằng mốc này.
export const KPI_FLEXIBLE_WEIGHT_TOTAL = 70;

export interface KpiScoreInput {
  targetRevenue: number;
  actualRevenue: number;
  weightRevenue: number;
  // DS ngành Sản xuất — chỉ tiêu/thực hiện riêng nhóm Sản xuất trong tháng (từ SalesPlanLine).
  targetRevenueSX: number;
  actualRevenueSX: number;
  weightRevenueSX: number;
  targetNewCustomers: number | null;
  actualNewCustomers: number | null;
  weightNewCustomers: number;
  debtOverduePct: number | null;
  debtCollectionRatePct: number | null;
  visitTarget: number;
  approvedVisitCount: number;
  weightVisit: number;
  violationCount: number;
  // Tổng điểm 0/1/2 của 4 tuần trong tháng (Kế hoạch làm việc tuần) — tính sẵn từ bên ngoài
  // (getMonthlyWeekPlanScore) rồi truyền vào, để computeKpiScores thuần không cần đụng DB.
  weekScore: number;
}

export interface KpiScoreResult {
  revenuePct: number | null;
  scoreRevenue: number;
  // Phần điểm THƯỞNG vượt chỉ tiêu (đã cộng sẵn vào scoreRevenue ở trên) — tách riêng để UI hiển
  // thị rõ khi có thưởng, xem scoreRatioWithBonus().
  revenueBonus: number;
  // Tỷ lệ đạt DS ngành Sản xuất (thực tế/chỉ tiêu, dạng thập phân như revenuePct).
  revenueSXPct: number | null;
  scoreSX: number;
  // Phần điểm THƯỞNG vượt chỉ tiêu của DS ngành SX (đã cộng sẵn vào scoreSX) — cùng cơ chế với
  // revenueBonus.
  revenueSXBonus: number;
  scoreNewCustomers: number;
  scoreDebtOverdue: number;
  scoreDebtCollection: number;
  scoreVisit: number;
  scoreAttitude: number;
  scoreWeek: number;
  totalScore: number;
  grade: KpiGrade;
  gradeLabel: string;
  bonusSuggestion: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function scoreDebtOverdueBand(pct: number | null): number {
  if (pct == null) return 0;
  if (pct < 15) return 10;
  if (pct < 25) return 8;
  if (pct < 31) return 6;
  return 3;
}

/**
 * Điểm theo tỷ lệ đạt (thực tế/chỉ tiêu) với trần `maxScore` (= trọng số do Quản trị viên nhập)
 * — CỘNG THÊM thưởng vượt chỉ tiêu — dùng chung cho Doanh số tổng và DS ngành Sản xuất. Từ 110%
 * chỉ tiêu trở lên, cứ mỗi 5% vượt thêm được cộng 1đ, KHÔNG giới hạn trần (khác các đầu điểm
 * dùng scoreRatioCapped bên dưới) — nên điểm mục đó và Điểm tổng có thể vượt quá mức tối đa
 * thông thường khi vượt xa chỉ tiêu, đúng tinh thần khuyến khích vượt chỉ tiêu của file mẫu.
 */
function scoreRatioWithBonus(pct: number | null, maxScore: number): { score: number; bonus: number } {
  const base = clamp((pct ?? 0) * maxScore, 0, maxScore);
  // % vượt chỉ tiêu, làm tròn về 1 chữ số thập phân TRƯỚC khi chia lấy số mốc 5% — tránh sai số
  // dấu phẩy động (vd (1.2-1)*10 ra 1.9999999999999998 trong JS thay vì 2, làm floor() hụt mốc).
  const overPct = pct != null ? Math.round((pct - 1) * 1000) / 10 : 0;
  const bonus = pct != null && pct >= 1.1 ? Math.floor(overPct / 5) : 0;
  return { score: base + bonus, bonus };
}

/** Điểm theo tỷ lệ đạt, CÓ TRẦN bằng đúng trọng số, KHÔNG có thưởng vượt — dùng cho KH mới và
 * CSKH/Đi gặp KH (khác Doanh số/DS SX ở trên). */
function scoreRatioCapped(actual: number | null, target: number | null, weight: number): number {
  if (target == null || target <= 0 || actual == null) return 0;
  return clamp((actual / target) * weight, 0, weight);
}

function gradeOf(total: number): { grade: KpiGrade; label: string; bonus: string } {
  if (total >= 90) return { grade: "A", label: "A - Xuất sắc", bonus: "100% mức thưởng KPI" };
  if (total >= 80) return { grade: "B", label: "B - Tốt", bonus: "70% mức thưởng KPI" };
  if (total >= 70) return { grade: "C", label: "C - Khá", bonus: "50% mức thưởng KPI" };
  if (total >= 60) return { grade: "D", label: "D - Đạt", bonus: "Xem xét theo tình hình thực tế" };
  return { grade: "F", label: "F - Chưa đạt", bonus: "Không thưởng KPI" };
}

/** Hàm tính điểm thuần (không đụng DB) — dễ test độc lập với công thức mẫu Excel. */
export function computeKpiScores(input: KpiScoreInput): KpiScoreResult {
  const revenuePct = input.targetRevenue > 0 ? input.actualRevenue / input.targetRevenue : null;
  const { score: scoreRevenue, bonus: revenueBonus } = scoreRatioWithBonus(revenuePct, input.weightRevenue);

  const revenueSXPct = input.targetRevenueSX > 0 ? input.actualRevenueSX / input.targetRevenueSX : null;
  const { score: scoreSX, bonus: revenueSXBonus } = scoreRatioWithBonus(revenueSXPct, input.weightRevenueSX);

  const scoreNewCustomers = scoreRatioCapped(input.actualNewCustomers, input.targetNewCustomers, input.weightNewCustomers);

  const scoreDebtOverdue = scoreDebtOverdueBand(input.debtOverduePct);
  const scoreDebtCollection =
    input.debtCollectionRatePct != null ? clamp((input.debtCollectionRatePct / 100) * 10, 0, 10) : 0;

  const scoreVisit = scoreRatioCapped(input.approvedVisitCount, input.visitTarget, input.weightVisit);

  const scoreAttitude = clamp(2 - input.violationCount, 0, 2);

  const scoreWeek = input.weekScore;

  // Làm tròn từng điểm thành phần TRƯỚC khi cộng — để "Điểm tổng" hiển thị luôn đúng bằng
  // tổng các cột điểm thành phần đã hiển thị (tránh lệch 0.1đ do sai số làm tròn khi cộng
  // trước rồi mới làm tròn sau).
  const rRevenue = round1(scoreRevenue);
  const rSX = round1(scoreSX);
  const rNewCustomers = round1(scoreNewCustomers);
  const rDebtCollection = round1(scoreDebtCollection);
  const rVisit = round1(scoreVisit);
  const rAttitude = round1(scoreAttitude);
  const rWeek = round1(scoreWeek);

  const totalScore = round1(
    rRevenue + rSX + rNewCustomers + scoreDebtOverdue + rDebtCollection + rVisit + rAttitude + rWeek
  );
  const { grade, label, bonus } = gradeOf(totalScore);

  return {
    revenuePct,
    scoreRevenue: rRevenue,
    revenueBonus,
    revenueSXPct,
    scoreSX: rSX,
    revenueSXBonus,
    scoreNewCustomers: rNewCustomers,
    scoreDebtOverdue,
    scoreDebtCollection: rDebtCollection,
    scoreVisit: rVisit,
    scoreAttitude: rAttitude,
    scoreWeek: rWeek,
    totalScore,
    grade,
    gradeLabel: label,
    bonusSuggestion: bonus,
  };
}

export interface KpiMonthlyReportRow extends KpiScoreResult {
  employeeId: string;
  employeeName: string;
  year: number;
  month: number;
  targetRevenue: number;
  actualRevenue: number;
  weightRevenue: number;
  targetRevenueSX: number;
  actualRevenueSX: number;
  weightRevenueSX: number;
  targetNewCustomers: number | null;
  actualNewCustomers: number | null;
  weightNewCustomers: number;
  debtOverduePct: number | null;
  debtCollectionRatePct: number | null;
  visitTarget: number;
  approvedVisitCount: number;
  weightVisit: number;
  violationCount: number;
  hasManualEntry: boolean;
}

export async function getKpiMonthlyReport(
  year: number,
  month: number,
  onlyEmployeeId?: string
): Promise<KpiMonthlyReportRow[]> {
  const { start, end } = monthRange(year, month);

  const [revenueRows, entries, visitCounts, supporterVisitCounts] = await Promise.all([
    getEmployeeTargetVsActual(year, month, onlyEmployeeId),
    prisma.kpiMonthlyEntry.findMany({
      where: { year, month, ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}) },
    }),
    prisma.businessTripRequest.groupBy({
      by: ["employeeId"],
      where: {
        status: "APPROVED",
        visitDate: { gte: start, lt: end },
        ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}),
      },
      _count: { _all: true },
    }),
    // Người đi HỖ TRỢ cũng được tính điểm "đi gặp khách" cho lượt đi đã duyệt — cộng thêm vào
    // visitByEmployee bên dưới (không có duyệt riêng, ăn theo trạng thái của trip).
    prisma.businessTripSupporter.groupBy({
      by: ["employeeId"],
      where: {
        trip: { status: "APPROVED", visitDate: { gte: start, lt: end } },
        ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const entryByEmployee = new Map(entries.map((e) => [e.employeeId, e]));
  const visitByEmployee = new Map(visitCounts.map((v) => [v.employeeId, v._count._all]));
  for (const v of supporterVisitCounts) {
    visitByEmployee.set(v.employeeId, (visitByEmployee.get(v.employeeId) ?? 0) + v._count._all);
  }

  const rows: KpiMonthlyReportRow[] = [];

  for (const r of revenueRows) {
    const entry = entryByEmployee.get(r.employeeId);

    // DS ngành Sản xuất cần chỉ tiêu/thực tế riêng nhóm Sản xuất của riêng người này — luôn gọi
    // có lọc đúng 1 nhân viên để không bị cộng dồn nhầm khi báo cáo nhiều người.
    const [groups, weekScore] = await Promise.all([
      getProductGroupTargetVsActual(year, month, r.employeeId),
      getMonthlyWeekPlanScore(r.employeeId, year, month),
    ]);
    const sx = groups.find((g) => g.group === "Sản xuất");

    const input: KpiScoreInput = {
      targetRevenue: r.targetRevenue,
      actualRevenue: r.actualRevenue,
      weightRevenue: entry?.weightRevenue ?? 30,
      targetRevenueSX: sx?.targetRevenue ?? 0,
      actualRevenueSX: sx?.actualRevenue ?? 0,
      weightRevenueSX: entry?.weightRevenueSX ?? 20,
      targetNewCustomers: entry?.targetNewCustomers ?? null,
      actualNewCustomers: entry?.actualNewCustomers ?? null,
      weightNewCustomers: entry?.weightNewCustomers ?? 10,
      debtOverduePct: entry?.debtOverduePct != null ? Number(entry.debtOverduePct) : null,
      debtCollectionRatePct: entry?.debtCollectionRatePct != null ? Number(entry.debtCollectionRatePct) : null,
      visitTarget: entry?.visitTarget ?? 8,
      approvedVisitCount: visitByEmployee.get(r.employeeId) ?? 0,
      weightVisit: entry?.weightVisit ?? 10,
      violationCount: entry?.violationCount ?? 0,
      weekScore,
    };

    const scores = computeKpiScores(input);

    rows.push({
      ...scores,
      ...input,
      employeeId: r.employeeId,
      employeeName: r.employeeName,
      year,
      month,
      hasManualEntry: !!entry,
    });
  }

  return rows;
}
