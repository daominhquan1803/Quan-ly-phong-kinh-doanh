import { prisma } from "@hoanggia/db";

type TripNotificationType = "TRIP_REPORT_DUE" | "TRIP_NEXT_STEP_DUE" | "TRIP_REVIEW_PENDING" | "TRIP_REVIEWED" | "TRIP_ASSIGNED" | "CARE_ESCALATION";
interface Payload {
  type: TripNotificationType;
  title: string;
  message: string;
  link?: string;
}

/** Thông báo trong app — lỗi ghi thông báo không được làm hỏng thao tác chính (nuốt lỗi, chỉ log). */
export async function notifyUser(userId: string, p: Payload): Promise<void> {
  try {
    await prisma.notification.create({ data: { userId, ...p } });
  } catch (err) {
    console.error("business-trip notify error", err);
  }
}

export async function notifyAdmins(p: Payload): Promise<void> {
  try {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", accessLevel: "FULL", active: true }, select: { id: true } });
    if (admins.length === 0) return;
    await prisma.notification.createMany({ data: admins.map((a) => ({ userId: a.id, ...p })) });
  } catch (err) {
    console.error("business-trip notifyAdmins error", err);
  }
}
