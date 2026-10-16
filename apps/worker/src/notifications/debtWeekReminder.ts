import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;

interface Row { employeeId: string; plannedCount: number; plannedAmount: number; slippedCount: number; slippedAmount: number }

const vnNow = () => new Date(Date.now() + 7 * 3600_000);
const money = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} đ`;

export function buildDebtWeekMessage(r: Row): { title: string; message: string } {
  const total = r.plannedCount + r.slippedCount;
  const parts = [`${r.plannedCount} khoản đúng kế hoạch tuần này (${money(r.plannedAmount)})`];
  if (r.slippedCount > 0) parts.push(`${r.slippedCount} khoản trượt từ tuần trước (${money(r.slippedAmount)})`);
  return { title: `Tuần này cần thu ${total} khoản công nợ`, message: `${parts.join("; ")}. Xem mục "Cần thu tuần này" ở trang Công nợ.` };
}

/** Sáng thứ Hai: báo từng NVKD tuần này cần thu những khoản nào, kể cả khoản trượt từ tuần trước. */
export async function runDebtWeekReminder(): Promise<{ notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) return { notified: 0 };
  if (vnNow().getUTCDay() !== 1) return { notified: 0 };

  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/debt-followup`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`debt-followup trả về ${res.status}`);
  const data = (await res.json()) as { rows: Row[] };

  const t = vnNow();
  const dayStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 7 * 3600_000);
  let notified = 0;
  for (const r of data.rows) {
    if (r.plannedCount + r.slippedCount === 0) continue;
    const already = await prisma.notification.findFirst({
      where: { userId: r.employeeId, type: "DEBT_WEEK_FOLLOWUP", createdAt: { gte: dayStart } },
      select: { id: true },
    });
    if (already) continue;
    const { title, message } = buildDebtWeekMessage(r);
    const created = await prisma.notification.create({
      data: { userId: r.employeeId, type: "DEBT_WEEK_FOLLOWUP", title, message, link: "/debt" },
    });
    if (await sendPushToUser(r.employeeId, { title, body: message, url: "/debt" })) {
      await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
    }
    notified++;
  }
  logger.info(`Nhắc công nợ đầu tuần: gửi ${notified} NVKD.`);
  return { notified };
}
