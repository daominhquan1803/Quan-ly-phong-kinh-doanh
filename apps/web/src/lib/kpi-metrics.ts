import { prisma } from "@hoanggia/db";
import { monthRange, getEmployeeTargetVsActual, getProductGroupTargetVsActual } from "./dashboard-metrics";

/**
 * Công thức tính điểm KPI hàng tháng — dựa theo file mẫu KPI_KD_HoanggiaPS.xlsx (sheet
 * KPI_Danh_gia_thang + Thang_diem_va_xep_loai + Huong_dan). Đã qua 3 lần cập nhật (anh Quân gửi
 * lại file/yêu cầu đổi tiêu chí):
 *  - Lần 1: "DS Sản xuất" (so tỷ lệ Doanh số SX thực hiện/chỉ tiêu) → đổi thành "Cơ cấu ngành
 *    hàng TM/SX" (so % cơ cấu thực tế với chỉ tiêu cố định 65% TM / 35% SX, chấm theo mức lệch) —
 *    "Lợi nhuận" (% lợi nhuận) → đổi thành "Giá bán cao" (đếm SỐ MÃ HÀNG bán cao hơn giá SX báo
 *    ≥3%).
 *  - Lần 2 (file gửi lại 24/08): thêm THƯỞNG VƯỢT CHỈ TIÊU cho Doanh số tổng — xem sheet
 *    "Thang_diem_va_xep_loai" mục 1a, dòng "Tỷ lệ cao >110%": từ tỷ lệ đạt 110% trở lên, cứ mỗi
 *    10% vượt thêm được cộng 1đ, KHÔNG giới hạn trần (khác 6 đầu điểm còn lại vẫn giữ nguyên
 *    trần tối đa).
 *  - Lần 3: đổi LẠI đầu điểm #2 — từ "Cơ cấu ngành hàng TM/SX" (mức lệch so với chỉ tiêu cố định
 *    65/35 ở Lần 1) sang "Doanh số ngành Sản xuất" thuần tỷ lệ thực hiện/chỉ tiêu riêng của
 *    NGÀNH SẢN XUẤT (không còn liên quan Thương mại/cơ cấu nữa) — đúng công thức MIN(10, tỷ lệ
 *    đạt DS SX × 20) ở sheet "Thang_diem_va_xep_loai" mục 1b, kèm THƯỞNG vượt 110% giống hệt cơ
 *    chế của Doanh số tổng (mục 1b cũng có dòng "Tỷ lệ cao >110%" y hệt mục 1a) — áp dụng cùng
 *    cách đọc cho nhất quán với đầu điểm #1. Chỉ tiêu/thực tế DS ngành SX lấy từ SalesPlanLine
 *    nhóm "Sản xuất" (cùng nguồn getProductGroupTargetVsActual dùng ở trang Kế hoạch kinh doanh),
 *    không cần nhập tay.
 *
 * Tổng 100 điểm, 8 đầu điểm:
 *  1. Doanh số            tối đa 20đ (+thưởng vượt 110%, không trần) — MIN(20, tỷ lệ đạt DS × 20) + thưởng — tự động, từ SalesTarget
 *  2. DS ngành Sản xuất    tối đa 10đ (+thưởng vượt 110%, không trần) — MIN(10, tỷ lệ đạt DS SX × 10) + thưởng — tự động, từ SalesPlanLine nhóm Sản xuất
 *  3. Giá bán cao          tối đa 10đ — MIN(10, số mã hàng thực tế / chỉ tiêu × 10)    — nhập tay (chưa có dữ liệu giá SX báo)
 *  4. KH mới               tối đa 10đ — MIN(10, tỷ lệ đạt KH mới × 10)                 — nhập tay
 *  5. Nợ quá hạn           tối đa 10đ — bậc thang theo %                              — nhập tay (chờ nối congno.hienvi.me)
 *  6. Thu hồi nợ           tối đa 10đ — MIN(10, tỷ lệ thu hồi × 10)                    — nhập tay (chờ nối congno.hienvi.me)
 *  7. CSKH & Chất lượng    tối đa 20đ — (Điểm đi gặp KH/10)×20 − hàng lỗi×3           — tự động, từ BusinessTripRequest + DefectReport
 *  8. Thái độ & kỷ luật    tối đa 10đ — (Chuyên cần/26)×10 − vi phạm×2                — nhập tay
 *
 * "Điểm đi gặp KH" (1-10) trong công thức #7 tự tính = MIN(10, số lượt đã duyệt / chỉ tiêu ×10).
 */

export type KpiGrade = "A" | "B" | "C" | "D" | "F";

export interface KpiScoreInput {
  targetRevenue: number;
  actualRevenue: number;
  // DS ngành Sản xuất — chỉ tiêu/thực hiện riêng nhóm Sản xuất trong tháng (từ SalesPlanLine),
  // dùng tính tỷ lệ đạt để chấm điểm #2 (không còn liên quan tới Thương mại/cơ cấu nữa).
  targetRevenueSX: number;
  actualRevenueSX: number;
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
  // thị rõ khi có thưởng, xem scoreRatioWithBonus().
  revenueBonus: number;
  // Tỷ lệ đạt DS ngành Sản xuất (thực tế/chỉ tiêu, dạng thập phân như revenuePct).
  revenueSXPct: number | null;
  scoreSX: number;
  // Phần điểm THƯỞNG vượt chỉ tiêu của DS ngành SX (đã cộng sẵn vào scoreSX) — cùng cơ chế với
  // revenueBonus.
  revenueSXBonus: number;
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

/**
 * Điểm theo tỷ lệ đạt (thực tế/chỉ tiêu) với trần `maxScore` — CỘNG THÊM thưởng vượt chỉ tiêu —
 * dùng chung cho Doanh số tổng (mục 1a, trần 20đ) và DS ngành Sản xuất (mục 1b, trần 10đ) trong
 * sheet "Thang_diem_va_xep_loai", cả 2 mục đều có cùng dòng "Tỷ lệ cao >110%": "Từ 110% tỷ lệ
 * cao hơn mỗi 10% cộng 1đ". Đọc là: đạt đúng 110% đã có +1đ, mỗi mốc 10% tiếp theo (120%,
 * 130%...) cộng thêm 1đ nữa — không giới hạn trần (khác phần MIN(maxScore,...) bên dưới), nên
 * điểm mục đó và Điểm tổng có thể vượt quá mức tối đa thông thường khi vượt xa chỉ tiêu — đúng
 * tinh thần khuyến khích vượt chỉ tiêu của file mẫu. File không nêu mốc chẵn 110% có tính hay
 * phải vượt qua mới tính — chọn cách đọc bao gồm mốc chẵn (>=110%) vì khớp sát nghĩa "từ 110%"
 * hơn "trên 110%" ở dòng mô tả.
 */
function scoreRatioWithBonus(pct: number | null, maxScore: number): { score: number; bonus: number } {
  const base = clamp((pct ?? 0) * maxScore, 0, maxScore);
  // % vượt chỉ tiêu, làm tròn về 1 chữ số thập phân TRƯỚC khi chia lấy số mốc 10% — tránh sai số
  // dấu phẩy động (vd (1.2-1)*10 ra 1.9999999999999998 trong JS thay vì 2, làm floor() hụt 1 mốc).
  const overPct = pct != null ? Math.round((pct - 1) * 1000) / 10 : 0;
  const bonus = pct != null && pct >= 1.1 ? Math.floor(overPct / 10) : 0;
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
  const { score: scoreRevenue, bonus: revenueBonus } = scoreRatioWithBonus(revenuePct, 20);

  const revenueSXPct = input.targetRevenueSX > 0 ? input.actualRevenueSX / input.targetRevenueSX : null;
  const { score: scoreSX, bonus: revenueSXBonus } = scoreRatioWithBonus(revenueSXPct, 10);

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
  const rSX = round1(scoreSX);
  const rHighPrice = round1(scoreHighPrice);
  const rNewCustomers = round1(scoreNewCustomers);
  const rDebtCollection = round1(scoreDebtCollection);
  const rCskh = round1(scoreCskh);
  const rAttitude = round1(scoreAttitude);

  const totalScore = round1(
    rRevenue + rSX + rHighPrice + rNewCustomers + scoreDebtOverdue + rDebtCollection + rCskh + rAttitude
  );
  const { grade, label, bonus } = gradeOf(totalScore);

  return {
    revenuePct,
    scoreRevenue: rRevenue,
    revenueBonus,
    revenueSXPct,
    scoreSX: rSX,
    revenueSXBonus,
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
  targetRevenueSX: number;
  actualRevenueSX: number;
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

    // DS ngành Sản xuất cần chỉ tiêu/thực tế riêng nhóm Sản xuất của riêng người này — luôn gọi
    // có lọc đúng 1 nhân viên để không bị cộng dồn nhầm khi báo cáo nhiều người.
    const groups = await getProductGroupTargetVsActual(year, month, r.employeeId);
    const sx = groups.find((g) => g.group === "Sản xuất");

    const input: KpiScoreInput = {
      targetRevenue: r.targetRevenue,
      actualRevenue: r.actualRevenue,
      targetRevenueSX: sx?.targetRevenue ?? 0,
      actualRevenueSX: sx?.actualRevenue ?? 0,
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
