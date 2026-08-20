import { prisma } from "@hoanggia/db";
import { monthRange, getEmployeeTargetVsActual, getProductGroupTargetVsActual } from "./dashboard-metrics";

/**
 * Công thức tính điểm KPI hàng tháng — dựa theo file mẫu KPI_KD_HoanggiaPS.xlsx (sheet
 * KPI_Danh_gia_thang + Thang_diem_va_xep_loai), đối chiếu khớp chính xác với cả 3 dòng số
 * liệu mẫu đã tính sẵn trong file (Đào Minh Quân 90đ hạng A, Đặng Văn Tấn 60đ hạng D, Ngô
 * Thanh Tùng 53đ hạng F — xem test kpi-metrics.test.ts).
 *
 * Tổng 100 điểm, 8 đầu điểm:
 *  1. Doanh số           tối đa 20đ  — MIN(20, tỷ lệ đạt DS × 20)         — tự động, từ SalesTarget
 *  2. Doanh số Sản xuất  tối đa 10đ  — MIN(10, tỷ lệ đạt DS SX × 10)      — tự động, từ SalesPlanLine nhóm Sản xuất
 *  3. Lợi nhuận          tối đa 10đ  — MIN(10, LN thực tế / chỉ tiêu ×10) — nhập tay (chưa có dữ liệu giá vốn)
 *  4. KH mới              tối đa 10đ  — MIN(10, tỷ lệ đạt KH mới ×10)      — nhập tay
 *  5. Nợ quá hạn          tối đa 10đ  — bậc thang theo %                   — nhập tay (chờ nối congno.hienvi.me)
 *  6. Thu hồi nợ          tối đa 10đ  — MIN(10, tỷ lệ thu hồi ×10)         — nhập tay (chờ nối congno.hienvi.me)
 *  7. CSKH & Chất lượng   tối đa 20đ  — (Điểm đi gặp KH/10)×20 − hàng lỗi×3 — tự động, từ BusinessTripRequest + DefectReport
 *  8. Thái độ & kỷ luật   tối đa 10đ  — (Chuyên cần/26)×10 − vi phạm×2     — nhập tay
 *
 * "Điểm đi gặp KH" (1-10) trong công thức #7 tự tính = MIN(10, số lượt đã duyệt / chỉ tiêu ×10).
 */

export type KpiGrade = "A" | "B" | "C" | "D" | "F";

export interface KpiScoreInput {
  targetRevenue: number;
  actualRevenue: number;
  targetRevenueSX: number;
  actualRevenueSX: number;
  targetProfitPct: number | null;
  actualProfitPct: number | null;
  targetNewCustomers: number | null;
  actualNewCustomers: number | null;
  debtOverduePct: number | null;
  debtCollectionRatePct: number | null;
  visitTarget: number;
  approvedVisitCount: number;
  defectCount: number;
  attendanceDays: number | null;
  violationCount: number;
}

export interface KpiScoreResult {
  revenuePct: number | null;
  scoreRevenue: number;
  revenueSXPct: number | null;
  scoreRevenueSX: number;
  scoreProfit: number;
  scoreNewCustomers: number;
  scoreDebtOverdue: number;
  scoreDebtCollection: number;
  scoreVisit: number;
  scoreCskh: number;
  scoreAttitude: number;
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
  const revenueSXPct = input.targetRevenueSX > 0 ? input.actualRevenueSX / input.targetRevenueSX : null;
  const scoreRevenue = clamp((revenuePct ?? 0) * 20, 0, 20);
  const scoreRevenueSX = clamp((revenueSXPct ?? 0) * 10, 0, 10);

  const scoreProfit =
    input.targetProfitPct && input.targetProfitPct > 0 && input.actualProfitPct != null
      ? clamp((input.actualProfitPct / input.targetProfitPct) * 10, 0, 10)
      : 0;

  const scoreNewCustomers =
    input.targetNewCustomers && input.targetNewCustomers > 0 && input.actualNewCustomers != null
      ? clamp((input.actualNewCustomers / input.targetNewCustomers) * 10, 0, 10)
      : 0;

  const scoreDebtOverdue = scoreDebtOverdueBand(input.debtOverduePct);
  const scoreDebtCollection =
    input.debtCollectionRatePct != null ? clamp((input.debtCollectionRatePct / 100) * 10, 0, 10) : 0;

  const scoreVisit = input.visitTarget > 0 ? clamp((input.approvedVisitCount / input.visitTarget) * 10, 0, 10) : 0;
  const scoreCskh = clamp((scoreVisit / 10) * 20 - input.defectCount * 3, 0, 20);

  const scoreAttitude =
    input.attendanceDays != null ? clamp((input.attendanceDays / 26) * 10 - input.violationCount * 2, 0, 10) : 0;

  // Làm tròn từng điểm thành phần TRƯỚC khi cộng — để "Điểm tổng" hiển thị luôn đúng bằng
  // tổng các cột điểm thành phần đã hiển thị (tránh lệch 0.1đ do sai số làm tròn khi cộng
  // trước rồi mới làm tròn sau).
  const rRevenue = round1(scoreRevenue);
  const rRevenueSX = round1(scoreRevenueSX);
  const rProfit = round1(scoreProfit);
  const rNewCustomers = round1(scoreNewCustomers);
  const rDebtCollection = round1(scoreDebtCollection);
  const rCskh = round1(scoreCskh);
  const rAttitude = round1(scoreAttitude);

  const totalScore = round1(
    rRevenue + rRevenueSX + rProfit + rNewCustomers + scoreDebtOverdue + rDebtCollection + rCskh + rAttitude
  );
  const { grade, label, bonus } = gradeOf(totalScore);

  return {
    revenuePct,
    scoreRevenue: rRevenue,
    revenueSXPct,
    scoreRevenueSX: rRevenueSX,
    scoreProfit: rProfit,
    scoreNewCustomers: rNewCustomers,
    scoreDebtOverdue,
    scoreDebtCollection: rDebtCollection,
    scoreVisit: round1(scoreVisit),
    scoreCskh: rCskh,
    scoreAttitude: rAttitude,
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
  targetRevenueSX: number;
  actualRevenueSX: number;
  targetProfitPct: number | null;
  actualProfitPct: number | null;
  targetNewCustomers: number | null;
  actualNewCustomers: number | null;
  debtOverduePct: number | null;
  debtCollectionRatePct: number | null;
  visitTarget: number;
  approvedVisitCount: number;
  defectCount: number;
  attendanceDays: number | null;
  violationCount: number;
  hasManualEntry: boolean;
}

export async function getKpiMonthlyReport(
  year: number,
  month: number,
  onlyEmployeeId?: string
): Promise<KpiMonthlyReportRow[]> {
  const { start, end } = monthRange(year, month);

  const [revenueRows, entries, visitCounts, defectCounts] = await Promise.all([
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
    prisma.defectReport.groupBy({
      by: ["employeeId"],
      where: {
        reportDate: { gte: start, lt: end },
        ...(onlyEmployeeId ? { employeeId: onlyEmployeeId } : {}),
      },
      _count: { _all: true },
    }),
  ]);

  const entryByEmployee = new Map(entries.map((e) => [e.employeeId, e]));
  const visitByEmployee = new Map(visitCounts.map((v) => [v.employeeId, v._count._all]));
  const defectByEmployee = new Map(defectCounts.map((d) => [d.employeeId, d._count._all]));

  const rows: KpiMonthlyReportRow[] = [];

  for (const r of revenueRows) {
    const entry = entryByEmployee.get(r.employeeId);

    // Doanh số SX riêng theo từng người — luôn gọi có lọc đúng 1 nhân viên để không bị cộng
    // dồn nhầm khi báo cáo nhiều người cùng lúc.
    const sxGroups = await getProductGroupTargetVsActual(year, month, r.employeeId);
    const sx = sxGroups.find((g) => g.group === "Sản xuất");

    const input: KpiScoreInput = {
      targetRevenue: r.targetRevenue,
      actualRevenue: r.actualRevenue,
      targetRevenueSX: sx?.targetRevenue ?? 0,
      actualRevenueSX: sx?.actualRevenue ?? 0,
      targetProfitPct: entry?.targetProfitPct != null ? Number(entry.targetProfitPct) : null,
      actualProfitPct: entry?.actualProfitPct != null ? Number(entry.actualProfitPct) : null,
      targetNewCustomers: entry?.targetNewCustomers ?? null,
      actualNewCustomers: entry?.actualNewCustomers ?? null,
      debtOverduePct: entry?.debtOverduePct != null ? Number(entry.debtOverduePct) : null,
      debtCollectionRatePct: entry?.debtCollectionRatePct != null ? Number(entry.debtCollectionRatePct) : null,
      visitTarget: entry?.visitTarget ?? 8,
      approvedVisitCount: visitByEmployee.get(r.employeeId) ?? 0,
      defectCount: defectByEmployee.get(r.employeeId) ?? 0,
      attendanceDays: entry?.attendanceDays != null ? Number(entry.attendanceDays) : null,
      violationCount: entry?.violationCount ?? 0,
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
