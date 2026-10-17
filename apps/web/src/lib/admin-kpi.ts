import { prisma } from "@hoanggia/db";
import { getMonthWeekRanges } from "./week-plan";

/**
 * KPI Admin kinh doanh (anh Quân chốt 17/10/2026).
 *
 * THÁNG (100đ): DS đi hàng cả phòng/KPI 15 · lỗi đơn hàng do Admin 15 · phiếu đi hàng nhập trong 2 ngày làm việc 10 ·
 * giao đúng hạn 10 · hoá đơn thay thế/điều chỉnh do lỗi Admin 10 · nhập tiền về D+1 7 · khiếu nại phản hồi 24h + đóng 7 ngày 10 ·
 * hồ sơ đầy đủ 5 (chấm tay) · NVKD chấm hài lòng 5 · thái độ 5 (chấm tay) · điểm tuần 8 (4 tuần × 0/1/2).
 * TUẦN (100đ): tiền về D+1 25 · phiếu 2 ngày 20 · lỗi đơn do Admin 20 · giao đúng hạn 20 · khiếu nại phản hồi 24h 15;
 * ≥ 80 -> 2đ, 60–79 -> 1đ, dưới 60 -> 0đ (cộng vào tháng).
 *
 * Ngày làm việc: Thứ Hai – Thứ Bảy (Chủ nhật nghỉ). Mục không có dữ liệu trong kỳ (vd không có khiếu nại) = đủ điểm.
 * Giao đúng hạn: dòng PO có ngày yêu cầu giao trong kỳ (đã tới hạn); đúng hạn = giao đủ SL trước hết ngày hạn; dòng trễ có lý do
 * được duyệt và không phải lỗi Admin thì loại khỏi phép tính. Hoá đơn thay thế/điều chỉnh chưa gán nguyên nhân = tính lỗi Admin.
 */

const VN = 7 * 3600_000;
const DAY = 86_400_000;
const EPS = 0.001;

export const DELAY_CATEGORIES: Record<string, string> = {
  SAN_XUAT: "Sản xuất",
  KE_HOACH: "Kế hoạch",
  KHACH_DOI_LICH: "Khách đổi lịch",
  VAN_CHUYEN: "Vận chuyển",
  ADMIN: "Lỗi Admin",
  KHAC: "Khác",
};
export const CORRECTION_CAUSES: Record<string, string> = {
  ADMIN: "Lỗi Admin",
  SALES: "Kinh doanh",
  ACCOUNTING: "Kế toán",
  CUSTOMER: "Khách hàng",
  OTHER: "Khác",
};

// ---------- Thời gian (giờ VN, Chủ nhật nghỉ) ----------
export const vnDayStart = (d: Date) => new Date(Math.floor((d.getTime() + VN) / DAY) * DAY - VN);
const isSunday = (dayStart: Date) => new Date(dayStart.getTime() + VN).getUTCDay() === 0;
/** Hết ngày làm việc thứ `n` sau ngày `d` (không tính chính ngày d, bỏ Chủ nhật) — mốc LOẠI TRỪ (0h ngày kế tiếp). */
export function workingDeadline(d: Date, n: number): Date {
  let day = vnDayStart(d);
  let left = n;
  while (left > 0) {
    day = new Date(day.getTime() + DAY);
    if (!isSunday(day)) left--;
  }
  return new Date(day.getTime() + DAY);
}

// ---------- Cho điểm ----------
/** Điểm theo % đạt: ≥ 95% đủ điểm, 90–95% 70%, 80–90% 40%, dưới 80% 0. Không có dữ liệu (null) = đủ điểm. */
export function bandScore(pct: number | null, max: number): number {
  if (pct === null) return max;
  const f = pct >= 95 ? 1 : pct >= 90 ? 0.7 : pct >= 80 ? 0.4 : 0;
  return Math.round(max * f * 10) / 10;
}
/** Điểm theo số lần lỗi: table[i] = điểm khi có i lỗi, quá độ dài bảng = 0. */
export const countScore = (n: number, table: number[]) => (n < table.length ? table[n] : 0);
export const pctOf = (ok: number, total: number) => (total > 0 ? Math.round((ok / total) * 1000) / 10 : null);
export const weekPointOf = (score: number) => (score >= 80 ? 2 : score >= 60 ? 1 : 0);
export function gradeOf(total: number): { grade: string; label: string } {
  if (total >= 90) return { grade: "A", label: "A - Xuất sắc" };
  if (total >= 80) return { grade: "B", label: "B - Tốt" };
  if (total >= 70) return { grade: "C", label: "C - Khá" };
  if (total >= 60) return { grade: "D", label: "D - Đạt" };
  return { grade: "F", label: "F - Chưa đạt" };
}

// ---------- Đánh giá từng loại dữ liệu (thuần, test được) ----------
export interface PaymentIn { paymentDate: Date | null; createdAt: Date }
export interface SlipIn { slipDate: Date | null; createdAt: Date }
export interface ComplaintIn { receivedAt: Date | null; createdAt: Date; respondedAt: Date | null; closedAt: Date | null }
export interface LineIn {
  id: string;
  poCode: string;
  itemCode: string | null;
  itemName: string | null;
  customerCode: string | null;
  requestedDeliveryDate: Date;
  poQuantity: number;
  poValue: number;
  events: { eventDate: Date; quantity: number }[];
  reason: { id: string; category: string; note: string | null; status: "PENDING" | "APPROVED" | "REJECTED"; reviewNote: string | null } | null;
}

export function evalPayments(rows: PaymentIn[]) {
  const dated = rows.filter((r) => r.paymentDate);
  const onTime = dated.filter((r) => r.createdAt < workingDeadline(r.paymentDate!, 1)).length;
  return { total: dated.length, onTime, pct: pctOf(onTime, dated.length) };
}

export function evalSlips(rows: SlipIn[]) {
  const dated = rows.filter((r) => r.slipDate);
  const onTime = dated.filter((r) => r.createdAt < workingDeadline(r.slipDate!, 2)).length;
  return { total: dated.length, onTime, pct: pctOf(onTime, dated.length) };
}

/** Khiếu nại: phản hồi trong 24 giờ (và với tháng: đóng trong 7 ngày). Khiếu nại chưa quá hạn mà chưa xử lý thì chưa tính. */
export function evalComplaints(rows: ComplaintIn[], now: Date, requireClose: boolean) {
  let total = 0;
  let ok = 0;
  for (const r of rows) {
    const received = r.receivedAt ?? r.createdAt;
    const respondBy = received.getTime() + DAY;
    const closeBy = received.getTime() + 7 * DAY;
    const responded = r.respondedAt ?? r.closedAt;
    const respondOk = !!responded && responded.getTime() <= respondBy;
    const respondKnown = respondOk || now.getTime() > respondBy || !!responded;
    const closeOk = !!r.closedAt && r.closedAt.getTime() <= closeBy;
    const closeKnown = closeOk || now.getTime() > closeBy || !!r.closedAt;
    if (!respondKnown || (requireClose && !closeKnown)) continue;
    total++;
    if (respondOk && (!requireClose || closeOk)) ok++;
  }
  return { total, ok, pct: pctOf(ok, total) };
}

export type LineVerdict = "ON_TIME" | "LATE" | "EXEMPT" | "NOT_DUE";
export function lineVerdict(l: LineIn, now: Date): LineVerdict {
  const dueEnd = vnDayStart(l.requestedDeliveryDate).getTime() + DAY;
  const deliveredByDue = l.events.filter((e) => e.eventDate.getTime() < dueEnd).reduce((s, e) => s + e.quantity, 0);
  if (deliveredByDue >= l.poQuantity - EPS) return "ON_TIME";
  if (now.getTime() < dueEnd) return "NOT_DUE";
  if (l.reason && l.reason.status === "APPROVED" && l.reason.category !== "ADMIN") return "EXEMPT";
  return "LATE";
}

export function evalDeliveries(lines: LineIn[], now: Date) {
  let dueValue = 0;
  let onTimeValue = 0;
  let exemptValue = 0;
  let lateCount = 0;
  for (const l of lines) {
    const v = lineVerdict(l, now);
    if (v === "NOT_DUE") continue;
    if (v === "EXEMPT") {
      exemptValue += l.poValue;
      continue;
    }
    dueValue += l.poValue;
    if (v === "ON_TIME") onTimeValue += l.poValue;
    else lateCount++;
  }
  return { dueValue, onTimeValue, exemptValue, lateCount, pct: dueValue > 0 ? Math.round((onTimeValue / dueValue) * 1000) / 10 : null };
}

// ---------- Tải dữ liệu ----------
async function loadPeriodData(start: Date, endExcl: Date, adminId: string) {
  const [payments, slips, lines, complaints, adminDefects] = await Promise.all([
    prisma.debtPayment.findMany({
      where: { paymentDate: { gte: start, lt: endExcl }, importBatchId: { not: null }, matchStatus: { not: "IGNORED" } },
      select: { paymentDate: true, createdAt: true },
    }),
    prisma.shipmentSlip.findMany({ where: { slipDate: { gte: start, lt: endExcl } }, select: { slipDate: true, createdAt: true } }),
    prisma.poTrackingLine.findMany({
      where: { requestedDeliveryDate: { gte: start, lt: endExcl }, baselineClosed: false, poQuantity: { gt: 0 } },
      select: {
        id: true,
        poCode: true,
        itemCode: true,
        itemName: true,
        customerCode: true,
        requestedDeliveryDate: true,
        poQuantity: true,
        poValue: true,
        deliveryEvents: { select: { eventDate: true, quantity: true } },
        delayReason: { select: { id: true, category: true, note: true, status: true, reviewNote: true } },
      },
    }),
    prisma.defectReport.findMany({
      where: { OR: [{ receivedAt: { gte: start, lt: endExcl } }, { receivedAt: null, createdAt: { gte: start, lt: endExcl } }] },
      select: { receivedAt: true, createdAt: true, respondedAt: true, closedAt: true },
    }),
    prisma.defectReport.count({ where: { reportDate: { gte: start, lt: endExcl }, responsibles: { some: { userId: adminId } } } }),
  ]);
  const lineRows: LineIn[] = lines.map((l) => ({
    id: l.id,
    poCode: l.poCode,
    itemCode: l.itemCode,
    itemName: l.itemName,
    customerCode: l.customerCode,
    requestedDeliveryDate: l.requestedDeliveryDate!,
    poQuantity: Number(l.poQuantity),
    poValue: Number(l.poValue),
    events: l.deliveryEvents.map((e) => ({ eventDate: e.eventDate, quantity: Number(e.quantity) })),
    reason: l.delayReason,
  }));
  return { payments, slips, lines: lineRows, complaints, adminDefects };
}

export interface AdminWeek {
  weekIndex: number;
  label: string;
  started: boolean;
  completed: boolean;
  payments: ReturnType<typeof evalPayments> & { points: number };
  slips: ReturnType<typeof evalSlips> & { points: number };
  adminDefects: { count: number; points: number };
  deliveries: ReturnType<typeof evalDeliveries> & { points: number };
  complaints: ReturnType<typeof evalComplaints> & { points: number };
  score: number;
  weekPoint: number;
}

const ddmm = (d: Date) => {
  const t = new Date(d.getTime() + VN);
  return `${String(t.getUTCDate()).padStart(2, "0")}/${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
};

export async function getAdminWeek(range: { weekIndex: number; start: Date; end: Date }, adminId: string, now: Date): Promise<AdminWeek> {
  const start = vnDayStart(range.start);
  const endExcl = new Date(vnDayStart(range.end).getTime() + DAY);
  const d = await loadPeriodData(start, endExcl, adminId);
  const payments = evalPayments(d.payments);
  const slips = evalSlips(d.slips);
  const deliveries = evalDeliveries(d.lines, now);
  const complaints = evalComplaints(d.complaints, now, false);
  const pPay = bandScore(payments.pct, 25);
  const pSlip = bandScore(slips.pct, 20);
  const pDef = countScore(d.adminDefects, [20, 10]);
  const pDel = bandScore(deliveries.pct, 20);
  const pCom = complaints.pct === null ? 15 : Math.round(complaints.pct * 0.15 * 10) / 10;
  const score = Math.round((pPay + pSlip + pDef + pDel + pCom) * 10) / 10;
  return {
    weekIndex: range.weekIndex,
    label: `Tuần ${range.weekIndex} (${ddmm(start)}–${ddmm(new Date(endExcl.getTime() - DAY))})`,
    started: now >= start,
    completed: now >= endExcl,
    payments: { ...payments, points: pPay },
    slips: { ...slips, points: pSlip },
    adminDefects: { count: d.adminDefects, points: pDef },
    deliveries: { ...deliveries, points: pDel },
    complaints: { ...complaints, points: pCom },
    score,
    weekPoint: now >= start ? weekPointOf(score) : 0,
  };
}

export interface AdminMonthItem {
  key: string;
  label: string;
  detail: string;
  score: number;
  max: number;
  manual?: boolean;
}

const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;

export async function getAdminKpi(year: number, month: number, adminId: string, now: Date = new Date()) {
  const start = new Date(Date.UTC(year, month - 1, 1) - VN);
  const endExcl = new Date(Date.UTC(year, month, 1) - VN);
  const ranges = getMonthWeekRanges(year, month);

  const statsEmployees = await prisma.user.findMany({
    where: { active: true, amisEmployeeCode: { not: null }, includeInSalesStats: true },
    select: { id: true },
  });
  const empIds = statsEmployees.map((e) => e.id);

  const [d, weeks, deliveredAgg, targetAgg, corrections, manual, ratings, salesCount] = await Promise.all([
    loadPeriodData(start, endExcl, adminId),
    Promise.all(ranges.map((r) => getAdminWeek(r, adminId, now))),
    prisma.poDeliveryEvent.aggregate({ where: { eventDate: { gte: start, lt: endExcl }, salesEmployeeId: { in: empIds } }, _sum: { value: true } }),
    prisma.salesTarget.aggregate({ where: { year, month, employeeId: { in: empIds } }, _sum: { targetRevenue: true } }),
    prisma.invoiceCorrection.findMany({
      where: { invoiceDate: { gte: start, lt: endExcl } },
      orderBy: { invoiceDate: "asc" },
      include: { causeSetBy: { select: { name: true } } },
    }),
    prisma.adminKpiManual.findUnique({ where: { adminId_year_month: { adminId, year, month } } }),
    prisma.adminSatisfactionRating.findMany({ where: { adminId, year, month }, include: { rater: { select: { name: true } } } }),
    prisma.user.count({ where: { role: "SALES", active: true } }),
  ]);

  const delivered = Number(deliveredAgg._sum.value ?? 0);
  const target = Number(targetAgg._sum.targetRevenue ?? 0);
  const dsPct = target > 0 ? delivered / target : null;
  const payments = evalPayments(d.payments);
  const slips = evalSlips(d.slips);
  const deliveries = evalDeliveries(d.lines, now);
  const complaints = evalComplaints(d.complaints, now, true);
  const adminCorrections = corrections.filter((c) => !c.cause || c.cause === "ADMIN").length;
  const avgRating = ratings.length ? ratings.reduce((s, r) => s + r.score, 0) / ratings.length : null;
  const weekPoints = weeks.reduce((s, w) => s + w.weekPoint, 0);
  const docsPct = manual?.documentsPct != null ? Number(manual.documentsPct) : null;
  const attitude = manual?.attitudeScore != null ? Number(manual.attitudeScore) : null;

  const items: AdminMonthItem[] = [
    { key: "sales", label: "Doanh số đi hàng cả phòng so với KPI", detail: `${money(delivered)} / ${money(target)}${dsPct !== null ? ` = ${(dsPct * 100).toFixed(1)}%` : ""}`, score: dsPct === null ? 0 : Math.round(Math.min(1, dsPct) * 15 * 10) / 10, max: 15 },
    { key: "adminDefects", label: "Lỗi đơn hàng do Admin (biên bản hàng lỗi)", detail: `${d.adminDefects} biên bản`, score: countScore(d.adminDefects, [15, 10, 5]), max: 15 },
    { key: "slips", label: "Phiếu đi hàng nhập trong 2 ngày làm việc", detail: `${slips.onTime}/${slips.total} phiếu${slips.pct !== null ? ` = ${slips.pct}%` : ""}`, score: bandScore(slips.pct, 10), max: 10 },
    { key: "deliveries", label: "Giao đúng hạn (đã loại trễ có lý do được duyệt)", detail: `${deliveries.pct ?? "—"}% theo giá trị · ${deliveries.lateCount} dòng trễ`, score: bandScore(deliveries.pct, 10), max: 10 },
    { key: "corrections", label: "Hoá đơn thay thế/điều chỉnh do lỗi Admin", detail: `${adminCorrections} hoá đơn (gồm hoá đơn chưa gán nguyên nhân) / ${corrections.length}`, score: countScore(adminCorrections, [10, 7, 4]), max: 10 },
    { key: "payments", label: "Nhập tiền về ngày hôm sau (D+1)", detail: `${payments.onTime}/${payments.total} khoản${payments.pct !== null ? ` = ${payments.pct}%` : ""}`, score: bandScore(payments.pct, 7), max: 7 },
    { key: "complaints", label: "Khiếu nại phản hồi trong 24 giờ và đóng trong 7 ngày", detail: complaints.total ? `${complaints.ok}/${complaints.total} khiếu nại đạt` : "Không có khiếu nại", score: complaints.pct === null ? 10 : Math.round(complaints.pct * 0.1 * 10) / 10, max: 10 },
    { key: "documents", label: "Hồ sơ PO / hợp đồng / mẫu in đầy đủ (chấm tay)", detail: docsPct === null ? "Chưa chấm" : `${docsPct}% hồ sơ đạt`, score: docsPct === null ? 0 : Math.round((docsPct / 100) * 5 * 10) / 10, max: 5, manual: true },
    { key: "satisfaction", label: "NVKD chấm mức hài lòng (1–5)", detail: avgRating === null ? `Chưa có NVKD chấm (0/${salesCount})` : `TB ${avgRating.toFixed(1)}/5 · ${ratings.length}/${salesCount} NVKD`, score: avgRating === null ? 0 : Math.round((avgRating / 5) * 5 * 10) / 10, max: 5 },
    { key: "attitude", label: "Thái độ, kỷ luật, việc được giao thêm (chấm tay)", detail: attitude === null ? "Chưa chấm" : `${attitude}/5`, score: attitude === null ? 0 : Math.max(0, Math.min(5, attitude)), max: 5, manual: true },
    { key: "weeks", label: "Điểm tuần (4 tuần × tối đa 2)", detail: weeks.map((w) => `T${w.weekIndex}: ${w.started ? w.weekPoint : "—"}`).join(" · "), score: weekPoints, max: 8 },
  ];
  const total = Math.round(items.reduce((s, i) => s + i.score, 0) * 10) / 10;

  const lateLines = d.lines
    .map((l) => ({ ...l, verdict: lineVerdict(l, now) }))
    .filter((l) => l.verdict === "LATE" || l.verdict === "EXEMPT" || l.reason)
    .sort((a, b) => a.requestedDeliveryDate.getTime() - b.requestedDeliveryDate.getTime());

  return {
    year,
    month,
    items,
    total,
    ...gradeOf(total),
    weeks,
    lateLines,
    corrections,
    manual,
    ratings: ratings.map((r) => ({ rater: r.rater.name, raterId: r.raterId, score: r.score, comment: r.comment })),
  };
}
