import webpush from "web-push";
import { prisma } from "@hoanggia/db";
import { logger } from "./logger";

// Gửi thông báo đẩy (Web Push) tới TẤT CẢ thiết bị đã đăng ký của 1 người dùng — dùng cho worker
// khi nhắc việc Kế hoạch tuần/KPI (song song với email, xem notifications/weekPlanReminder.ts và
// kpiReminder.ts). Chưa cấu hình VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY thì bỏ qua, chỉ ghi log —
// KHÔNG ném lỗi, giống hệt cơ chế "chưa cấu hình SMTP" ở email.ts.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:sale5.hoanggiaps@gmail.com";

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
}

export function isPushConfigured(): boolean {
  return configured;
}

/** Gửi push tới mọi thiết bị của 1 người — trả về true nếu gửi thành công tới ÍT NHẤT 1 thiết bị
 * (để notifications/*.ts biết mà đánh dấu pushSentAt). Thiết bị đã gỡ cài app/thu hồi quyền thông
 * báo khiến Google/Apple trả về 404/410 ("Gone") — tự xoá bản ghi PushSubscription tương ứng luôn,
 * tránh tích tụ rác và thử gửi lại vô ích mỗi ngày. */
export async function sendPushToUser(
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  if (!configured) {
    logger.warn("Chưa cấu hình VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY — bỏ qua gửi thông báo đẩy.");
    return false;
  }

  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subscriptions.length === 0) return false;

  const payloadJson = JSON.stringify(payload);
  let anySuccess = false;
  const staleIds: string[] = [];

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payloadJson
        );
        anySuccess = true;
      } catch (err) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          staleIds.push(sub.id);
        } else {
          logger.error(`Gửi push thất bại tới thiết bị ${sub.id} của user ${userId}:`, err instanceof Error ? err.message : err);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    logger.info(`Đã xoá ${staleIds.length} đăng ký push hết hạn (thiết bị đã gỡ cài/thu hồi quyền).`);
  }

  return anySuccess;
}
