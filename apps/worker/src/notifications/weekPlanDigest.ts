import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;
const PASS_THRESHOLD = 80; // mốc "Đạt", cùng weekGradeFromTotalPoints ở apps/web/src/lib/week-plan.ts
const TOP_LAGGING = 3;

interface Cell { target: number; actual: number; weight: number; point: number }
interface Row { employeeId: string; totalPoints: number; metrics: Record<string, Cell> }

const vnNow = () => new Date(Date.now() + 7 * 3600_000);

/** Nội dung tin hằng ngày: điểm hiện tại + các mục thiếu điểm nhiều nhất (theo số điểm còn mất). */
export function buildWeekPlanDigest(
  row: Pick<Row, "totalPoints" | "metrics">,
  metricLabels: Record<string, string>,
  weekLabel: string,
  daysLeft: number
): { title: string; message: string } {
  const lagging = Object.entries(row.metrics)
    .filter(([, c]) => c.target > 0 && c.actual < c.target)
    .map(([key, c]) => ({ key, c, lost: Math.round((c.weight - c.point) * 10) / 10 }))
    .sort((a, b) => b.lost - a.lost)
    .slice(0, TOP_LAGGING);

  const pts = `${row.totalPoints}/100 điểm`;
  const status = row.totalPoints >= PASS_THRESHOLD ? "đã đạt" : `chưa đạt (cần ≥ ${PASS_THRESHOLD})`;
  const left = daysLeft > 0 ? `Còn ${daysLeft} ngày tới hết tuần.` : "Hôm nay là ngày cuối tuần.";
  const tail =
    lagging.length === 0
      ? "Đã đủ chỉ tiêu mọi mục."
      : "Thiếu nhiều nhất: " +
        lagging.map(({ key, c, lost }) => `${metricLabels[key] ?? key} ${c.actual}/${c.target} (thiếu ${lost} điểm)`).join("; ") +
        ".";
  return { title: `Kế hoạch tuần: ${pts}`, message: `${weekLabel}: ${pts}, ${status}. ${left} ${tail}` };
}

function daysUntil(dateISO: string): number {
  const d = new Date(new Date(dateISO).getTime() + 7 * 3600_000);
  const t = vnNow();
  return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86_400_000);
}

/**
 * Hằng ngày (trừ Chủ nhật): báo từng NVKD điểm Kế hoạch tuần hiện tại và các mục còn thiếu nhiều nhất.
 * Hôm trước ngày cuối tuần mà chưa đạt thì đã có tin "Sắp hết tuần" (weekPlanReminder.ts) nên bỏ qua để khỏi trùng.
 */
export async function runWeekPlanDigest(): Promise<{ checked: number; notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) {
    logger.warn("Chưa cấu hình INTERNAL_SYNC_TOKEN — bỏ qua tin điểm Kế hoạch tuần hằng ngày.");
    return { checked: 0, notified: 0 };
  }
  if (vnNow().getUTCDay() === 0) return { checked: 0, notified: 0 };

  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/week-plan-status`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`week-plan-status trả về ${res.status}`);
  const data = (await res.json()) as { weekEnd: string; weekLabel: string; metricLabels: Record<string, string>; rows: Row[] };

  const daysLeft = daysUntil(data.weekEnd);
  const dayStart = new Date(Date.UTC(vnNow().getUTCFullYear(), vnNow().getUTCMonth(), vnNow().getUTCDate()) - 7 * 3600_000);
  let notified = 0;

  for (const row of data.rows) {
    const hasTargets = Object.values(row.metrics).some((c) => c.target > 0);
    if (!hasTargets) continue;
    if (daysLeft === 1 && row.totalPoints < PASS_THRESHOLD) continue;

    const already = await prisma.notification.findFirst({
      where: { userId: row.employeeId, type: "WEEK_PLAN_DAILY", createdAt: { gte: dayStart } },
      select: { id: true },
    });
    if (already) continue;

    const { title, message } = buildWeekPlanDigest(row, data.metricLabels, data.weekLabel, daysLeft);
    const created = await prisma.notification.create({
      data: { userId: row.employeeId, type: "WEEK_PLAN_DAILY", title, message, link: "/week-plan" },
    });
    if (await sendPushToUser(row.employeeId, { title, body: message, url: "/week-plan" })) {
      await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
    }
    notified++;
  }

  logger.info(`Tin điểm Kế hoạch tuần hằng ngày: kiểm tra ${data.rows.length} người, gửi ${notified}.`);
  return { checked: data.rows.length, notified };
}
