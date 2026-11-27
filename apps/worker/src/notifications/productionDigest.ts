import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;
// Số liệu sản xuất cũ hơn mức này (đồng bộ hỏng) thì không nhắc, tránh báo sai.
const STALE_MS = 3 * 3_600_000;
const LABEL: Record<string, string> = { LATE: "Trễ", AT_RISK: "Nguy cơ trễ", DONE_NOT_SHIPPED: "Xong chưa giao" };

interface Row {
  employeeId: string;
  late: number;
  atRisk: number;
  done: number;
  top: { poCode: string; itemCode: string | null; customerCode: string | null; dueOn: string | null; alert: string }[];
}

const vn = (d: Date) => new Date(d.getTime() + 7 * 3_600_000);
const dayMonth = (iso: string | null) => {
  if (!iso) return "—";
  const d = vn(new Date(iso));
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function buildProductionMessage(r: Row): { title: string; message: string } {
  const lines = r.top.map((l) => `• ${l.poCode} · ${l.itemCode ?? "—"} · ${l.customerCode ?? "—"} · hạn ${dayMonth(l.dueOn)} · ${LABEL[l.alert] ?? l.alert}`);
  return {
    title: `Tiến độ hàng: ${r.late} trễ, ${r.atRisk} nguy cơ trễ, ${r.done} xong chưa giao`,
    message: [...lines, 'Xem đủ ở trang Tiến độ giao hàng, tab "Tiến độ hàng hoá".'].join("\n"),
  };
}

/** 8h sáng, trừ Chủ nhật: nhắc từng NVKD hàng trễ, nguy cơ trễ và đã sản xuất xong chưa giao. */
export async function runProductionDigest(now: Date = new Date()): Promise<{ notified: number }> {
  const t = vn(now);
  if (!INTERNAL_SYNC_TOKEN || t.getUTCDay() === 0) return { notified: 0 };

  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/production-digest`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`production-digest trả về ${res.status}`);
  const data = (await res.json()) as { syncedAt: string | null; rows: Row[] };
  if (!data.syncedAt || now.getTime() - new Date(data.syncedAt).getTime() > STALE_MS) {
    logger.warn(`Bỏ qua nhắc tiến độ hàng: số liệu sản xuất ${data.syncedAt ? `cũ (đồng bộ lúc ${data.syncedAt})` : "chưa có"}.`);
    return { notified: 0 };
  }

  const dayStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()) - 7 * 3_600_000);
  const link = "/shipping-status?tab=production";
  let notified = 0;
  for (const r of data.rows) {
    const already = await prisma.notification.findFirst({
      where: { userId: r.employeeId, type: "PRODUCTION_DAILY", createdAt: { gte: dayStart } },
      select: { id: true },
    });
    if (already) continue;
    const { title, message } = buildProductionMessage(r);
    const created = await prisma.notification.create({ data: { userId: r.employeeId, type: "PRODUCTION_DAILY", title, message, link } });
    if (await sendPushToUser(r.employeeId, { title, body: message, url: link })) {
      await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
    }
    notified++;
  }
  logger.info(`Nhắc tiến độ hàng: gửi ${notified} NVKD.`);
  return { notified };
}
