import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendEmail } from "../email";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;
// Nhắc trước 3 ngày hết tháng.
const REMINDER_DAYS_BEFORE_MONTH_END = 3;
// Đệm 15% — chỉ coi là "chậm tiến độ" khi tỉ lệ đạt thấp hơn tỉ lệ ngày đã trôi qua của tháng ít
// nhất mức đệm này, tránh nhắc oan khi chỉ lệch nhẹ (doanh số thường dồn về cuối tháng/cuối quý).
const PACE_BUFFER = 0.15;

interface KpiStatusRow {
  employeeId: string;
  employeeName: string;
  notifyEmail: string | null;
  targetRevenue: number;
  actualRevenue: number;
  revenuePct: number | null;
  targetRevenueSX: number;
  actualRevenueSX: number;
  revenueSXPct: number | null;
  targetNewCustomers: number | null;
  actualNewCustomers: number | null;
  visitTarget: number;
  approvedVisitCount: number;
  totalScore: number;
}
interface KpiStatusResponse {
  year: number;
  month: number;
  daysInMonth: number;
  today: number;
  rows: KpiStatusRow[];
}

function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

function pctLabel(pct: number | null): string {
  return pct == null ? "chưa có chỉ tiêu" : `${Math.round(pct * 100)}%`;
}

/**
 * Kiểm tra + gửi thông báo nhắc KPI tháng còn 3 ngày là hết tháng mà tiến độ (doanh số/DS SX/KH
 * mới/CSKH) đang thấp hơn đáng kể so với tỉ lệ số ngày đã trôi qua của tháng.
 */
export async function runKpiReminder(): Promise<{ checked: number; notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) {
    logger.warn("Chưa cấu hình INTERNAL_SYNC_TOKEN — bỏ qua nhắc việc KPI tháng.");
    return { checked: 0, notified: 0 };
  }

  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/kpi-status`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`kpi-status trả về ${res.status}`);
  }
  const data = (await res.json()) as KpiStatusResponse;

  const remaining = data.daysInMonth - data.today;
  if (remaining !== REMINDER_DAYS_BEFORE_MONTH_END) {
    logger.info(`Nhắc KPI tháng: còn ${remaining} ngày hết tháng ${data.month}/${data.year} — chưa tới mốc nhắc (${REMINDER_DAYS_BEFORE_MONTH_END} ngày).`);
    return { checked: data.rows.length, notified: 0 };
  }

  const expectedPct = data.today / data.daysInMonth;
  const { start: todayStart, end: todayEnd } = todayRange();
  let notified = 0;

  for (const row of data.rows) {
    const newCustomersPct =
      row.targetNewCustomers && row.targetNewCustomers > 0 && row.actualNewCustomers != null
        ? row.actualNewCustomers / row.targetNewCustomers
        : null;
    const visitPct = row.visitTarget > 0 ? row.approvedVisitCount / row.visitTarget : null;

    const behind: string[] = [];
    if (row.targetRevenue > 0 && row.revenuePct != null && row.revenuePct < expectedPct - PACE_BUFFER) {
      behind.push(`Doanh số tổng (${pctLabel(row.revenuePct)}, đã qua ${pctLabel(expectedPct)} thời gian)`);
    }
    if (row.targetRevenueSX > 0 && row.revenueSXPct != null && row.revenueSXPct < expectedPct - PACE_BUFFER) {
      behind.push(`DS ngành Sản xuất (${pctLabel(row.revenueSXPct)})`);
    }
    if (newCustomersPct != null && newCustomersPct < expectedPct - PACE_BUFFER) {
      behind.push(`KH mới (${pctLabel(newCustomersPct)})`);
    }
    if (visitPct != null && visitPct < expectedPct - PACE_BUFFER) {
      behind.push(`CSKH/Đi gặp KH (${pctLabel(visitPct)})`);
    }

    if (behind.length === 0) continue;

    const already = await prisma.notification.findFirst({
      where: { userId: row.employeeId, type: "KPI_REMINDER", createdAt: { gte: todayStart, lt: todayEnd } },
    });
    if (already) continue;

    const title = `Còn ${REMINDER_DAYS_BEFORE_MONTH_END} ngày hết tháng — KPI đang chậm tiến độ`;
    const message = `Các mục đang thấp hơn tiến độ thời gian của tháng: ${behind.join("; ")}.`;

    await prisma.notification.create({
      data: { userId: row.employeeId, type: "KPI_REMINDER", title, message, link: "/kpi" },
    });

    if (row.notifyEmail) {
      const html = `
        <p>Chào ${row.employeeName},</p>
        <p><strong>${title}</strong></p>
        <p>${message}</p>
        <p>Xem chi tiết tại mục "Đánh giá KPI" trên hệ thống Hoàng Gia CRM.</p>
      `;
      const sent = await sendEmail(row.notifyEmail, title, html);
      if (sent) {
        await prisma.notification.updateMany({
          where: { userId: row.employeeId, type: "KPI_REMINDER", createdAt: { gte: todayStart, lt: todayEnd } },
          data: { emailSentAt: new Date() },
        });
      }
    }

    // Thông báo đẩy lên điện thoại (PWA) — kênh song song với email, không phụ thuộc notifyEmail.
    const pushSent = await sendPushToUser(row.employeeId, { title, body: message, url: "/kpi" });
    if (pushSent) {
      await prisma.notification.updateMany({
        where: { userId: row.employeeId, type: "KPI_REMINDER", createdAt: { gte: todayStart, lt: todayEnd } },
        data: { pushSentAt: new Date() },
      });
    }

    notified++;
  }

  logger.info(`Nhắc KPI tháng: kiểm tra ${data.rows.length} người, gửi thông báo cho ${notified} người.`);
  return { checked: data.rows.length, notified };
}
