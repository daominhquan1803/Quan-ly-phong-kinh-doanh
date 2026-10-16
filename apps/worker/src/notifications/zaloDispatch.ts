import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { isZaloConfigured, sendZaloText } from "../zalo";

const APP_URL = (process.env.NEXTAUTH_URL || process.env.APP_PUBLIC_URL || "").replace(/\/$/, "");
// Chỉ gửi trong khung 7h–20h giờ Việt Nam; tin tạo ngoài giờ nằm chờ tới 7h sáng. Tin quá 18 giờ thì bỏ (hết giá trị).
const SEND_FROM_HOUR = 7;
const SEND_TO_HOUR = 20;
const MAX_AGE_MS = 18 * 3600_000;
const MAX_FAILS = 5;

// ponytail: đếm lỗi trong bộ nhớ — khởi động lại worker thì đếm lại từ 0; thêm cột nếu cần bền hơn.
const fails = new Map<string, number>();

export function vnHour(now: Date = new Date()): number {
  return new Date(now.getTime() + 7 * 3600_000).getUTCHours();
}

export function formatZaloText(n: { title: string; message: string; link: string | null }): string {
  const url = n.link && APP_URL ? `\n${APP_URL}${n.link}` : "";
  return `${n.title}\n${n.message}${url}`;
}

/**
 * Chạy mỗi phút: gửi qua Zalo mọi Notification (do web hoặc worker tạo) chưa gửi, cho người đã liên kết
 * Zalo, tạo SAU lúc liên kết, và chưa tắt loại thông báo đó. Gửi lỗi thì thử lại phút sau (tối đa 5 lần).
 */
export async function runZaloDispatch(now: Date = new Date()): Promise<{ sent: number; failed: number }> {
  if (!isZaloConfigured()) return { sent: 0, failed: 0 };
  const hour = vnHour(now);
  if (hour < SEND_FROM_HOUR || hour >= SEND_TO_HOUR) return { sent: 0, failed: 0 };

  const rows = await prisma.notification.findMany({
    where: {
      zaloSentAt: null,
      createdAt: { gte: new Date(now.getTime() - MAX_AGE_MS) },
      user: { active: true, zaloChatId: { not: null } },
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      link: true,
      createdAt: true,
      user: { select: { zaloChatId: true, zaloLinkedAt: true, zaloOffTypes: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  let sent = 0;
  let failed = 0;
  for (const n of rows) {
    const u = n.user;
    if (!u.zaloChatId || !u.zaloLinkedAt || n.createdAt < u.zaloLinkedAt) continue;
    if ((u.zaloOffTypes ?? []).includes(n.type)) continue;
    if ((fails.get(n.id) ?? 0) >= MAX_FAILS) continue;

    const r = await sendZaloText(u.zaloChatId, formatZaloText(n));
    if (r.ok) {
      await prisma.notification.update({ where: { id: n.id }, data: { zaloSentAt: new Date() } });
      fails.delete(n.id);
      sent++;
    } else {
      fails.set(n.id, (fails.get(n.id) ?? 0) + 1);
      logger.error(`Gửi Zalo thất bại (thông báo ${n.id}): ${r.error}`);
      failed++;
    }
  }
  if (sent > 0 || failed > 0) logger.info(`Zalo: gửi ${sent} tin, lỗi ${failed}.`);
  return { sent, failed };
}
