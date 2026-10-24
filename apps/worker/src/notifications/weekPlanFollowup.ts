import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const vnNow = () => new Date(Date.now() + 7 * 3600_000);

/**
 * 8h mỗi ngày làm việc: nhắc NVKD "Hành động tiếp theo" của khách liên hệ mới khi tới (hoặc quá) ngày hẹn.
 * Mỗi dòng chỉ nhắc 1 lần (followUpNotifiedAt); nếu worker nghỉ đúng ngày hẹn thì nhắc bù ở lần chạy sau.
 */
export async function runWeekPlanFollowup(): Promise<{ notified: number }> {
  const t = vnNow();
  if (t.getUTCDay() === 0) return { notified: 0 };
  const endOfToday = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1) - 7 * 3600_000);
  const due = await prisma.weekPlanResultEntry.findMany({
    where: { nextActionAt: { lt: endOfToday }, followUpNotifiedAt: null, nextAction: { not: null } },
    select: { id: true, employeeId: true, customerName: true, nextAction: true, nextActionAt: true, contactName: true, contactPhone: true },
    take: 200,
  });
  let notified = 0;
  for (const e of due) {
    const contact = [e.contactName, e.contactPhone].filter(Boolean).join(" - ");
    const data = {
      userId: e.employeeId,
      type: "WEEK_PLAN_FOLLOWUP" as const,
      title: `Đến hẹn: ${e.customerName}`,
      message: `${e.nextAction}${contact ? ` (liên hệ: ${contact})` : ""}`,
      link: "/week-plan",
    };
    const created = await prisma.notification.create({ data });
    if (await sendPushToUser(e.employeeId, { title: data.title, body: data.message, url: data.link })) {
      await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
    }
    await prisma.weekPlanResultEntry.update({ where: { id: e.id }, data: { followUpNotifiedAt: new Date() } });
    notified++;
  }
  if (notified) logger.info(`Nhắc hành động tiếp theo (kế hoạch tuần): gửi ${notified} tin.`);
  return { notified };
}
