import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

type TripNotificationType = "TRIP_REPORT_DUE" | "TRIP_NEXT_STEP_DUE" | "TRIP_REVIEW_PENDING";

function todayVNString(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}
const dayVN = (d: Date): string => new Date(d.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
const fmt = (ymd: string): string => ymd.split("-").reverse().join("/");

function todayRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/** Tạo thông báo trong app + đẩy lên điện thoại, mỗi người tối đa 1 thông báo cùng loại mỗi ngày. */
async function notifyOncePerDay(userId: string, type: TripNotificationType, title: string, message: string, link: string): Promise<boolean> {
  const { start, end } = todayRange();
  const already = await prisma.notification.findFirst({ where: { userId, type, createdAt: { gte: start, lt: end } } });
  if (already) return false;
  const created = await prisma.notification.create({ data: { userId, type, title, message, link } });
  const pushed = await sendPushToUser(userId, { title, body: message, url: link });
  if (pushed) await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
  return true;
}

/**
 * Nhắc việc công tác hằng ngày (cùng giờ cron nhắc việc khác):
 *  - NVKD: buổi đã qua ngày đi mà chưa nộp báo cáo (hoặc đang bị yêu cầu bổ sung) — nhắc hạn chót (hết thứ Hai tuần kế tiếp);
 *  - NVKD/người phụ trách: bước tiếp theo sau buổi gặp tới hạn hoặc trễ hạn;
 *  - Quản trị viên: báo cáo công tác đang chờ duyệt (chưa tính điểm).
 */
export async function runTripReminder(): Promise<{ reportDue: number; nextStepDue: number; reviewPending: number }> {
  const today = todayVNString();
  let reportDue = 0;
  let nextStepDue = 0;
  let reviewPending = 0;

  // ---- 1) Chưa nộp báo cáo ----
  const waiting = await prisma.businessTripRequest.findMany({
    where: { status: { in: ["PENDING", "NEEDS_REVISION"] } },
    select: { employeeId: true, visitDate: true, status: true },
  });
  const byEmployee = new Map<string, { n: number; revisions: number; oldest: string }>();
  for (const t of waiting) {
    const d = t.visitDate.toISOString().slice(0, 10); // visitDate lưu theo UTC nửa đêm của ngày đã chọn
    if (t.status === "PENDING" && d >= today) continue; // chưa tới/đúng ngày đi
    const cur = byEmployee.get(t.employeeId) ?? { n: 0, revisions: 0, oldest: d };
    cur.n++;
    if (t.status === "NEEDS_REVISION") cur.revisions++;
    if (d < cur.oldest) cur.oldest = d;
    byEmployee.set(t.employeeId, cur);
  }
  for (const [userId, v] of byEmployee) {
    const message =
      `Bạn có ${v.n} buổi đi công tác chưa hoàn tất báo cáo` +
      (v.revisions > 0 ? ` (${v.revisions} báo cáo cần bổ sung)` : "") +
      `, sớm nhất ngày ${fmt(v.oldest)}. Buổi đi chỉ được tính điểm sau khi báo cáo được duyệt — hạn chót nộp là hết thứ Hai của tuần kế tiếp sau tuần đi.`;
    if (await notifyOncePerDay(userId, "TRIP_REPORT_DUE", "Nhắc nộp báo cáo công tác", message, "/business-trips")) reportDue++;
  }

  // ---- 2) Bước tiếp theo tới hạn / trễ hạn ----
  const steps = await prisma.businessTripStop.findMany({
    where: {
      nextAction: { not: null },
      nextActionDoneAt: null,
      nextActionDue: { not: null },
      nextActionOwnerId: { not: null },
      outcome: { in: ["MET", "RESCHEDULED"] },
      trip: { status: { in: ["REPORTED", "APPROVED"] } },
    },
    select: { companyName: true, nextAction: true, nextActionDue: true, nextActionOwnerId: true },
  });
  const stepsByOwner = new Map<string, { overdue: number; dueToday: number; samples: string[] }>();
  for (const s of steps) {
    const due = dayVN(s.nextActionDue as Date);
    if (due > today) continue;
    const owner = s.nextActionOwnerId as string;
    const cur = stepsByOwner.get(owner) ?? { overdue: 0, dueToday: 0, samples: [] };
    if (due < today) cur.overdue++;
    else cur.dueToday++;
    if (cur.samples.length < 3) cur.samples.push(`${s.companyName}: ${s.nextAction}`);
    stepsByOwner.set(owner, cur);
  }
  for (const [userId, v] of stepsByOwner) {
    const parts = [];
    if (v.dueToday > 0) parts.push(`${v.dueToday} việc đến hạn hôm nay`);
    if (v.overdue > 0) parts.push(`${v.overdue} việc trễ hạn`);
    const message = `${parts.join(", ")} sau các buổi gặp khách — ${v.samples.join("; ")}${v.dueToday + v.overdue > v.samples.length ? "..." : ""}`;
    if (await notifyOncePerDay(userId, "TRIP_NEXT_STEP_DUE", "Việc tiếp theo sau buổi gặp khách", message, "/business-trips")) nextStepDue++;
  }

  // ---- 3) Quản trị viên: báo cáo chờ duyệt ----
  const pending = await prisma.businessTripRequest.count({ where: { status: "REPORTED" } });
  if (pending > 0) {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    for (const a of admins) {
      const message = `${pending} báo cáo công tác đang chờ duyệt — chưa được tính vào Kế hoạch tuần/KPI.`;
      if (await notifyOncePerDay(a.id, "TRIP_REVIEW_PENDING", "Báo cáo công tác chờ duyệt", message, "/business-trips")) reviewPending++;
    }
  }

  logger.info(`Nhắc công tác: ${reportDue} người chưa nộp báo cáo, ${nextStepDue} người có việc tiếp theo tới hạn, ${reviewPending} admin có báo cáo chờ duyệt.`);
  return { reportDue, nextStepDue, reviewPending };
}
