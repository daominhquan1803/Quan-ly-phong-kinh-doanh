import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendEmail } from "../email";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;
// "Đạt" theo đúng mốc weekGradeFromTotalPoints ở apps/web/src/lib/week-plan.ts (80-100 -> 2).
const PASS_THRESHOLD = 80;

interface WeekPlanMetricCell {
  target: number;
  actual: number;
  weight: number;
  point: number;
}
interface WeekPlanStatusRow {
  employeeId: string;
  employeeName: string;
  notifyEmail: string | null;
  totalPoints: number;
  weekGrade: 0 | 1 | 2;
  metrics: Record<string, WeekPlanMetricCell>;
}
interface WeekPlanStatusResponse {
  weekStart: string;
  weekIndex: number;
  weekEnd: string;
  weekLabel: string;
  metricLabels: Record<string, string>;
  rows: WeekPlanStatusRow[];
}

function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Số ngày còn lại tính TRÒN theo lịch (không tính giờ) — vd hôm nay 30/8, hết tuần 31/8 -> 1. */
function daysUntil(dateISO: string): number {
  const target = new Date(dateISO);
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  const today = new Date();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((targetDay.getTime() - todayDay.getTime()) / 86_400_000);
}

/**
 * Kiểm tra + gửi thông báo nhắc "Kế hoạch làm việc tuần" cho nhân viên còn 1 ngày là hết tuần mà
 * Tổng điểm hiện tại chưa đạt mức "Đạt" (< 80) — cả trong app lẫn email (nếu có notifyEmail).
 * Không gửi trùng nhiều lần trong cùng 1 ngày cho cùng 1 người.
 */
export async function runWeekPlanReminder(): Promise<{ checked: number; notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) {
    logger.warn("Chưa cấu hình INTERNAL_SYNC_TOKEN — bỏ qua nhắc việc Kế hoạch tuần.");
    return { checked: 0, notified: 0 };
  }

  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/week-plan-status`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`week-plan-status trả về ${res.status}`);
  }
  const data = (await res.json()) as WeekPlanStatusResponse;

  const remaining = daysUntil(data.weekEnd);
  if (remaining !== 1) {
    logger.info(`Nhắc Kế hoạch tuần: còn ${remaining} ngày hết ${data.weekLabel} — chưa tới mốc nhắc (1 ngày).`);
    return { checked: data.rows.length, notified: 0 };
  }

  const { start: todayStart, end: todayEnd } = todayRange();
  let notified = 0;

  for (const row of data.rows) {
    if (row.totalPoints >= PASS_THRESHOLD) continue;

    const already = await prisma.notification.findFirst({
      where: {
        userId: row.employeeId,
        type: "WEEK_PLAN_REMINDER",
        createdAt: { gte: todayStart, lt: todayEnd },
      },
    });
    if (already) continue;

    const laggingMetrics = Object.entries(row.metrics)
      .filter(([, cell]) => cell.actual < cell.target)
      .map(([key, cell]) => `${data.metricLabels[key] ?? key}: ${cell.actual}/${cell.target}`);

    const title = `Sắp hết ${data.weekLabel} — chưa đạt chỉ tiêu`;
    const message =
      `Tổng điểm hiện tại: ${row.totalPoints}/100 (cần ≥ 80 để "Đạt"). ` +
      (laggingMetrics.length > 0 ? `Mục còn thiếu: ${laggingMetrics.join("; ")}.` : "");

    await prisma.notification.create({
      data: {
        userId: row.employeeId,
        type: "WEEK_PLAN_REMINDER",
        title,
        message,
        link: "/week-plan",
      },
    });

    if (row.notifyEmail) {
      const html = `
        <p>Chào ${row.employeeName},</p>
        <p><strong>${title}</strong></p>
        <p>${message}</p>
        <p>Xem chi tiết và cập nhật tại mục "Kế hoạch làm việc tuần" trên hệ thống Hoàng Gia CRM.</p>
      `;
      const sent = await sendEmail(row.notifyEmail, title, html);
      if (sent) {
        await prisma.notification.updateMany({
          where: { userId: row.employeeId, type: "WEEK_PLAN_REMINDER", createdAt: { gte: todayStart, lt: todayEnd } },
          data: { emailSentAt: new Date() },
        });
      }
    }

    notified++;
  }

  logger.info(`Nhắc Kế hoạch tuần: kiểm tra ${data.rows.length} người, gửi thông báo cho ${notified} người.`);
  return { checked: data.rows.length, notified };
}
