import { prisma } from "@hoanggia/db";
import { monthRange, getEmployeeTargetVsActual, getProductGroupTargetVsActual } from "./dashboard-metrics";

/**
 * Công thức tính điểm KPI hàng tháng — dựa theo file mẫu KPI_KD_HoanggiaPS.xlsx (sheet
 * KPI_Danh_gia_thang + Thang_diem_va_xep_loai + Huong_dan). Đã qua 2 lần cập nhật (anh Quân gửi
 * lại file, xác nhận đổi tiêu chí):
 *  - Lần 1: "DS Sản xuất" (so tỷ lệ Doanh số SX thực hiện/chỉ tiêu) → đổi thành "Cơ cấu ngành
 *    hàng TM/SX" (so % cơ cấu thực tế với chỉ tiêu cố định 65% TM / 35% SX, chấm theo mức lệch —
 *    xem sheet "Huong_dan" mục 16, mô tả này KHÔNG đổi ở bản file mới nhất, vẫn giữ nguyên công
 *    thức này); "Lợi nhuận" (% lợi nhuận) → đổi thành "Giá bán cao" (đếm SỐ MÃ HÀNG bán cao hơn
 *    giá SX báo ≥3%).
 *  - Lần 2 (file gửi lại 24/08): thêm THƯỞNG VƯỢT CHỈ TIÊU cho Doanh số tổng — xem sheet
 *    "Thang_diem_va_xep_loai" mục 1a, dòng "Tỷ lệ cao >110%": từ tỷ lệ đạt 110% trở lên, cứ mỗi
 *    10% vượt thêm được cộng 1đ, KHÔNG giới hạn trần (khác 6 đầu điểm còn lại vẫn giữ nguyên
 *    trần tối đa). Sheet "Thang_diem_va_xep_loai" mục 1b (Doanh số hàng SX, công thức tỷ lệ cũ)
 *    và phần trọng số % ở đầu 2 sheet Huong_dan/Thang_diem_va_xep_loai vẫn là văn bản CŨ chưa
 *    dọn hết khi anh ghép/sửa file (mục 1b đã bị thay hoàn toàn bởi Cơ cấu ngành hàng ở trên,
 *    không còn áp dụng) — không lấy các phần này làm căn cứ, chỉ theo đúng công thức + số điểm
 *    tối đa nêu ở mục "Tổng 100 điểm" bên dưới (khớp với các cột thật trong KPI_Danh_gia_thang).
 *
 * Tổng 100 điểm, 8 đầu điểm:
 *  1. Doanh số            tối đa 20đ (+thưởng vượt 110%, không trần) — MIN(20, tỷ lệ đạt DS × 20) + thưởng — tự động, từ SalesTarget
 *  2. Cơ cấu ngành hàng    tối đa 10đ — chấm theo mức lệch % cơ cấu SX so với 35%      — tự động, từ SalesPlanLine nhóm SX/TM
 *  3. Giá bán cao          tối đa 10đ — MIN(10, số mã hàng thực tế / chỉ tiêu × 10)    — nhập tay (chưa có dữ liệu giá SX báo)
 *  4. KH mới               tối đa 10đ — MIN(10, tỷ lệ đạt KH mới × 10)                 — nhập tay
 *  5. Nợ quá hạn           tối đa 10đ — bậc thang theo %                              — nhập tay (chờ nối congno.hienvi.me)
 *  6. Thu hồi nợ           tối đa 10đ — MIN(10, tỷ lệ thu hồi × 10)                    — nhập tay (chờ nối congno.hienvi.me)
 *  7. CSKH & Chất lượng    tối đa 20đ — (Điểm đi gặp KH/10)×20 − hàng lỗi×3           — tự động, từ BusinessTripRequest + DefectReport
 *  8. Thái độ & kỷ luật    tối đa 10đ — (Chuyên cần/26)×10 − vi phạm×2                — nhập tay
 *
 * "Điểm đi gặp KH" (1-10) trong công thức #7 tự tính = MIN(10, số lượt đã duyệt / chỉ tiêu ×10).
 */

// Chỉ tiêu cơ cấu ngành hàng cố định toàn phòng (không theo kế hoạch riêng từng người) — 65%
// Thương mại / 35% Sản xuất, theo đúng file KPI_KD_HoanggiaPS.xlsx.
const TARGET_MIX_SX_PCT = 35;

export type KpiGrade = "A" | "B" | "C" | "D" | "F";

export interface KpiScoreInput {
  targetRevenue: number;
  actualRevenue: number;
  // Cơ cấu ngành hàng — doanh số thực tế 2 nhóm Sản xuất/Thương mại trong tháng, dùng tính %
  // cơ cấu thực tế so với chỉ tiêu cố định TARGET_MIX_SX_PCT (không cần chỉ tiêu SX riêng nữa).
  actualRevenueSX: number;
  actualRevenueTM: number;
  targetHighPriceSkuCount: number | null;
  actualHighPriceSkuCount: number | null;
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
  // Phần điểm THƯỞNG vượt chỉ tiêu (đã cộng sẵn vào scoreRevenue ở trên) — tách riêng để UI hiển
  // thị rõ khi có thưởng, xem scoreRevenueWithBonus().
  revenueBonus: number;
  // % doanh số Sản xuất trong tổng (SX+TM) thực tế, và độ lệch tuyệt đối so với chỉ tiêu 35%.
  actualMixSXPct: number | null;
  mixDeviationPct: number | null;
  scoreMix: number;
  scoreHighPrice: number;
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

// Chấm điểm Cơ cấu ngành hàng theo MỨC LỆCH (độ lệch tuyệt đối, %) giữa % Sản xuất thực tế và
// chỉ tiêu cố định 35% — theo đúng mô tả trong sheet "Huong_dan" mục 16 (đã anh xác nhận dùng
// cách này thay cho cách tính tỷ lệ Doanh số SX thực hiện/chỉ tiêu cũ).
function scoreMixDeviationBand(deviationPct: number | null): number {
  if (deviationPct == null) return 0;
  if (deviationPct <= 5) return 10;
  if (deviationPct <= 10) return 7;
  if (deviationPct <= 15) return 3;
  return 0;
}

/**
 * Điểm Doanh số tổng (tối đa 20đ như cũ) CỘNG THÊM thưởng vượt chỉ tiêu — theo sheet
 * "Thang_diem_va_xep_loai" mục 1a, dòng "Tỷ lệ cao >110%": "Từ 110% tỷ lệ cao hơn mỗi 10% cộng
 * 1đ". Đọc là: đạt đúng 110% đã có +1đ, mỗi mốc 10% tiếp theo (120%, 130%...) cộng thêm 1đ nữa —
 * không giới hạn trần (khác phần MIN(20,...) bên dưới), nên Điểm DS và Điểm tổng có thể vượt quá
 * mức tối đa thông thường khi vượt xa chỉ tiêu — đúng tinh thần khuyến khích vượt chỉ tiêu của
 * file mẫu. File không nêu mốc chẵn 110% có tính hay phải vượt qua mới tính — chọn cách đọc bao
 * gồm mốc chẵn (>=110%) vì khớp sát nghĩa "từ 110%" hơn "trên 110%" ở dòng mô tả.
 */
function scoreRevenueWithBonus(revenuePct: number | null): { score: number; bonus: number } {
  const base = clamp((revenuePct ?? 0) * 20, 0, 20);
  // % vượt chỉ tiêu, làm tròn về 1 chữ số thập phân TRƯỚC khi chia lấy số mốc 10% — tránh sai số
  // dấu phẩy động (vd (1.2-1)*10 ra 1.9999999999999998 trong JS thay vì 2, làm floor() hụt 1 mốc).
  const overPct = revenuePct != null ? Math.round((revenuePct - 1) * 1000) / 10 : 0;
  const bonus = revenuePct != null && revenuePct >= 1.1 ? Math.floor(overPct / 10) : 0;
  return { score: base + bonus, bonus };
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
  const { score: scoreRevenue, bonus: revenueBonus } = scoreRevenueWithBonus(revenuePct);

  const mixTotal = input.actualRevenueSX + input.actualRevenueTM;
  const actualMixSXPct = mixTotal > 0 ? (input.actualRevenueSX / mixTotal) * 100 : null;
  const mixDeviationPct = actualMixSXPct != null ? Math.abs(actualMixSXPct - TARGET_MIX_SX_PCT) : null;
  const scoreMix = scoreMixDeviationBand(mixDeviationPct);

  const scoreHighPrice =
    input.targetHighPriceSkuCount && input.targetHighPriceSkuCount > 0 && input.actualHighPriceSkuCount != null
      ? clamp((input.actualHighPriceSkuCount / input.targetHighPriceSkuCount) * 10, 0, 10)
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
  const rMix = round1(scoreMix);
  const rHighPrice = round1(scoreHighPrice);
  const rNewCustomers = round1(scoreNewCustomers);
  const rDebtCollection = round1(scoreDebtCollection);
  const rCskh = round1(scoreCskh);
  const rAttitude = round1(scoreAttitude);

  const totalScore = round1(
    rRevenue + rMix + rHighPrice + rNewCustomers + scoreDebtOverdue + rDebtCollection + rCskh + rAttitude
  );
  const { grade, label, bonus } = gradeOf(totalScore);

  return {
    revenuePct,
    scoreRevenue: rRevenue,
    revenueBonus,
    actualMixSXPct,
    mixDeviationPct,
    scoreMix: rMix,
    scoreHighPrice: rHighPrice,
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
  actualRevenueSX: number;
  actualRevenueTM: number;
  targetHighPriceSkuCount: number | null;
  actualHighPriceSkuCount: number | null;
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

    // Cơ cấu ngành hàng cần doanh số thực tế CẢ 2 nhóm Sản xuất/Thương mại của riêng người này
    // — luôn gọi có lọc đúng 1 nhân viên để không bị cộng dồn nhầm khi báo cáo nhiều người.
    const groups = await getProductGroupTargetVsActual(year, month, r.employeeId);
    const sx = groups.find((g) => g.group === "Sản xuất");
    const tm = groups.find((g) => g.group === "Thương mại");

    const input: KpiScoreInput = {
      targetRevenue: r.targetRevenue,
      actualRevenue: r.actualRevenue,
      actualRevenueSX: sx?.actualRevenue ?? 0,
      actualRevenueTM: tm?.actualRevenue ?? 0,
      targetHighPriceSkuCount: entry?.targetHighPriceSkuCount ?? null,
      actualHighPriceSkuCount: entry?.actualHighPriceSkuCount ?? null,
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
