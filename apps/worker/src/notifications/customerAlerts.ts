import { prisma } from "@hoanggia/db";
import { logger } from "../logger";
import { sendPushToUser } from "../push";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;

interface RiskRow { employeeId: string; customerId: string; customerName: string; level: "HIGH" | "MEDIUM"; silentDays: number; medianGapDays: number; ratio: number; trendPct: number | null; totalValue: number }
interface SeasonRow { employeeId: string; customerId: string; customerName: string; stage: "REMIND" | "ESCALATE" | "MISSED"; season: string; seasonMonth: number }
interface FollowUpRow { employeeId: string; customerId: string; customerName: string; followUpAt: string }
interface AlertsPayload { risks: RiskRow[]; seasons: SeasonRow[]; followUps: FollowUpRow[]; managerIds: string[] }

type Type = "CUSTOMER_RISK" | "SEASON_REMINDER";
interface Msg { userId: string; type: Type; title: string; message: string; link: string }

const money = (n: number) => `${Math.round(n / 1_000_000).toLocaleString("vi-VN")} triệu`;
const careLink = (customerId: string, extra: string) => `/cham-soc?customer=${customerId}&${extra}`;

export function buildRiskMessage(r: RiskRow): Msg {
  const lvl = r.level === "HIGH" ? "Nguy cơ cao" : "Cần chú ý";
  const trend = r.trendPct != null && r.trendPct < 0 ? ` Doanh số 90 ngày giảm ${Math.abs(r.trendPct)}% so kỳ trước.` : "";
  return {
    userId: r.employeeId,
    type: "CUSTOMER_RISK",
    title: `[${lvl}] ${r.customerName}`,
    message:
      `Đã ${r.silentDays} ngày chưa đặt hàng (thường ~${Math.round(r.medianGapDays)} ngày/lần, gấp ${r.ratio} lần).${trend} ` +
      `Giá trị đã mua ${money(r.totalValue)}. Hãy liên hệ khách và ghi kết quả.`,
    link: careLink(r.customerId, `alert=${r.level}`),
  };
}

export function buildSeasonMessages(s: SeasonRow, managerIds: string[]): Msg[] {
  const link = careLink(s.customerId, `season=${s.season}&stage=${s.stage}`);
  const m = s.seasonMonth;
  if (s.stage === "REMIND") {
    return [{ userId: s.employeeId, type: "SEASON_REMINDER", title: `Sắp vào vụ tháng ${m}: ${s.customerName}`,
      message: `${s.customerName} thường mua vào tháng ${m}. Hãy liên hệ chào hàng, xin kế hoạch sản lượng và ghi kết quả.`, link }];
  }
  if (s.stage === "ESCALATE") {
    return [s.employeeId, ...managerIds].map((userId) => ({ userId, type: "SEASON_REMINDER" as const,
      title: `Chưa liên hệ khách vào vụ tháng ${m}: ${s.customerName}`,
      message: `${s.customerName} sắp vào vụ tháng ${m} nhưng chưa có ghi nhận chăm sóc nào.`, link }));
  }
  return [s.employeeId, ...managerIds].map((userId) => ({ userId, type: "SEASON_REMINDER" as const,
    title: `[Lỡ vụ] ${s.customerName} chưa có đơn vụ tháng ${m}`,
    message: `Hết tháng ${m} nhưng ${s.customerName} chưa đặt hàng. Cần xác minh khách còn mua không.`, link }));
}

export function buildFollowUpMessage(f: FollowUpRow): Msg {
  return {
    userId: f.employeeId, type: "CUSTOMER_RISK", title: `Đến hạn chăm sóc lại: ${f.customerName}`,
    message: `Anh/chị đã hẹn chăm sóc lại khách này. Hãy liên hệ và ghi kết quả.`,
    link: careLink(f.customerId, `followup=${f.followUpAt.slice(0, 10)}`),
  };
}

/** Hằng ngày: nhắc NVKD các khách nguy cơ chưa chăm sóc, khách sắp vào/lỡ vụ, lời hẹn đến hạn. Chống nhắc trùng theo (người, link). */
export async function runCustomerAlerts(): Promise<{ notified: number }> {
  if (!INTERNAL_SYNC_TOKEN) return { notified: 0 };
  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/customer-alerts`, {
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`customer-alerts trả về ${res.status}`);
  const data = (await res.json()) as AlertsPayload;

  const msgs: Msg[] = [
    ...data.risks.map(buildRiskMessage),
    ...data.seasons.flatMap((s) => buildSeasonMessages(s, data.managerIds)),
    ...data.followUps.map(buildFollowUpMessage),
  ];

  // Cảnh báo nguy cơ lặp lại sau 14 ngày nếu chưa xử lý; nhắc vụ/hẹn lại chỉ 1 lần cho mỗi link.
  const since = new Date(Date.now() - 14 * 86_400_000);
  let notified = 0;
  for (const m of msgs) {
    const recurring = m.link.includes("alert=");
    const already = await prisma.notification.findFirst({
      where: { userId: m.userId, type: m.type, link: m.link, ...(recurring ? { createdAt: { gte: since } } : {}) },
      select: { id: true },
    });
    if (already) continue;
    const created = await prisma.notification.create({ data: m });
    if (await sendPushToUser(m.userId, { title: m.title, body: m.message, url: m.link })) {
      await prisma.notification.update({ where: { id: created.id }, data: { pushSentAt: new Date() } });
    }
    notified++;
  }
  logger.info(`Cảnh báo khách hàng: gửi ${notified} thông báo.`);
  return { notified };
}
