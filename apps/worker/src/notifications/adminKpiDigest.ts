import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;
const LINK = "/kpi-admin";

interface Row {
  adminId: string;
  name: string;
  weekLabel: string;
  score: number;
  weekPoint: number;
  payments: { onTime: number; total: number };
  slips: { onTime: number; total: number };
}
interface Pending { lateNoReason: number; correctionsNoCause: number; complaintsOpen: number; complaintsOverdue: number }

/** Nội dung tin hằng ngày cho Admin kinh doanh: điểm KPI tuần + việc tồn cần xử lý. */
export function buildAdminKpiDigest(row: Row, p: Pending): { title: string; message: string } {
  const todo: string[] = [];
  if (p.lateNoReason) todo.push(`${p.lateNoReason} dòng PO giao trễ chưa nhập lý do`);
  if (p.correctionsNoCause) todo.push(`${p.correctionsNoCause} hoá đơn điều chỉnh/thay thế chưa gán nguyên nhân (đang tính lỗi Admin)`);
  if (p.complaintsOverdue) todo.push(`${p.complaintsOverdue} khiếu nại quá 24h chưa phản hồi khách`);
  else if (p.complaintsOpen) todo.push(`${p.complaintsOpen} khiếu nại chưa phản hồi khách (hạn 24h)`);
  const pts = `${row.score}/100 điểm`;
  const point = row.weekPoint === 2 ? "đang được 2 điểm tuần" : row.weekPoint === 1 ? "đang được 1 điểm tuần (cần ≥ 80 để được 2)" : "chưa đạt điểm tuần (cần ≥ 60)";
  return {
    title: `KPI tuần: ${pts}`,
    message:
      `${row.weekLabel}: ${pts}, ${point}. Tiền về nhập D+1 ${row.payments.onTime}/${row.payments.total}, phiếu đi hàng đúng hạn ${row.slips.onTime}/${row.slips.total}.` +
      (todo.length ? ` Cần xử lý: ${todo.join("; ")}.` : " Không có việc tồn."),
  };
}

async function notifyOnce(userId: string, type: "ADMIN_KPI_DAILY" | "DELAY_REASON_PENDING", title: string, message: string, dayStart: Date) {
  const already = await prisma.notification.findFirst({ where: { userId, type, createdAt: { gte: dayStart } }, select: { id: true } });
  if (already) return false;
  const created = await prisma.notification.create({ data: { userId, type, title, message, link: LINK } });
  if (await sendPushToUser(userId, { title, body: message, url: LINK })) {
    await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
  }
  return true;
}

/** Hằng ngày (trừ Chủ nhật) 8h: Admin kinh doanh nhận điểm KPI tuần + việc tồn; trưởng phòng nhận tin khi có lý do giao trễ chờ duyệt. */
export async function runAdminKpiDigest(): Promise<{ admins: number; notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) {
    logger.warn("Chưa cấu hình INTERNAL_SYNC_TOKEN — bỏ qua tin KPI Admin hằng ngày.");
    return { admins: 0, notified: 0 };
  }
  const vn = new Date(Date.now() + 7 * 3600_000);
  if (vn.getUTCDay() === 0) return { admins: 0, notified: 0 };
  const dayStart = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - 7 * 3600_000);

  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/admin-kpi-status`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`admin-kpi-status trả về ${res.status}`);
  const data = (await res.json()) as { rows: Row[]; pending: Pending; pendingReasons: number; systemAdminIds: string[] };

  let notified = 0;
  for (const row of data.rows) {
    const { title, message } = buildAdminKpiDigest(row, data.pending);
    if (await notifyOnce(row.adminId, "ADMIN_KPI_DAILY", title, message, dayStart)) notified++;
  }
  if (data.pendingReasons > 0) {
    const title = `${data.pendingReasons} lý do giao trễ chờ duyệt`;
    const message = `Admin kinh doanh đã nhập ${data.pendingReasons} lý do giao trễ, cần anh duyệt để tính KPI giao đúng hạn.`;
    for (const id of data.systemAdminIds) if (await notifyOnce(id, "DELAY_REASON_PENDING", title, message, dayStart)) notified++;
  }
  logger.info(`Tin KPI Admin hằng ngày: ${data.rows.length} Admin kinh doanh, gửi ${notified} tin.`);
  return { admins: data.rows.length, notified };
}
