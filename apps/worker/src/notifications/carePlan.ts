import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;

type CareType = "CARE_DUE_DAILY" | "CARE_ESCALATION" | "CARE_WEEKLY";
interface CareMsg { userId: string; type: CareType; title: string; message: string; link: string }
interface Payload { daily: CareMsg[]; escalations: CareMsg[]; weekly: CareMsg[] }

const vnNow = () => new Date(Date.now() + 7 * 3600_000);

async function fetchPlan(weekly: boolean): Promise<Payload> {
  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/care-plan${weekly ? "?weekly=1" : ""}`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN! },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`care-plan trả về ${res.status}`);
  return (await res.json()) as Payload;
}

/** Tạo thông báo nếu (người nhận, loại, link) chưa có — link mang sẵn khoá ngày/khách/lần ghi nên không gửi trùng. */
async function deliver(msgs: CareMsg[]): Promise<number> {
  let n = 0;
  for (const m of msgs) {
    const already = await prisma.notification.findFirst({ where: { userId: m.userId, type: m.type, link: m.link }, select: { id: true } });
    if (already) continue;
    const created = await prisma.notification.create({ data: m });
    if (await sendPushToUser(m.userId, { title: m.title, body: m.message, url: m.link })) {
      await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
    }
    n++;
  }
  return n;
}

/** 8h mỗi ngày làm việc: lịch cần chạm cho NVKD; thứ 2 thêm tổng kết tuần trước cho trưởng phòng; kèm cảnh báo leo thang. */
export async function runCareDaily(): Promise<{ notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) return { notified: 0 };
  const dow = vnNow().getUTCDay();
  if (dow === 0) return { notified: 0 };
  const data = await fetchPlan(dow === 1);
  const notified = await deliver([...data.daily, ...data.weekly, ...data.escalations]);
  logger.info(`Lịch chăm sóc 8h: gửi ${notified} tin.`);
  return { notified };
}

/** Quét 15 phút/lần trong giờ làm việc: cảnh báo leo thang gửi ngay cho trưởng phòng. */
export async function runCareEscalations(): Promise<{ notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) return { notified: 0 };
  const t = vnNow();
  const hour = t.getUTCHours() + t.getUTCMinutes() / 60;
  if (t.getUTCDay() === 0 || hour < 7.5 || hour > 18) return { notified: 0 };
  const data = await fetchPlan(false);
  const notified = await deliver(data.escalations);
  if (notified) logger.info(`Cảnh báo chăm sóc: gửi ${notified} tin.`);
  return { notified };
}
