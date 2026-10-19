// Gọi Zalo Bot API (https://bot-api.zaloplatforms.com/bot<TOKEN>/<method>). Chưa cấu hình
// ZALO_BOT_TOKEN thì không làm gì (trả ok:false), giống cơ chế "chưa cấu hình SMTP/VAPID".
const BASE = "https://bot-api.zaloplatforms.com";

export function isZaloConfigured(): boolean {
  return !!process.env.ZALO_BOT_TOKEN && !!process.env.ZALO_WEBHOOK_SECRET;
}

export async function sendZaloText(chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.ZALO_BOT_TOKEN;
  if (!token) return { ok: false, error: "Chưa cấu hình ZALO_BOT_TOKEN" };
  try {
    const res = await fetch(`${BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 2000) }),
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (res.ok && json?.ok) return { ok: true };
    return { ok: false, error: json?.description ?? `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Lỗi mạng" };
  }
}

/** Loại thông báo nhân viên có thể tự bật/tắt trên Zalo (khoá = NotificationType). */
export const ZALO_TYPE_LABEL: Record<string, string> = {
  WEEK_PLAN_DAILY: "Điểm Kế hoạch tuần hằng ngày",
  WEEK_PLAN_REMINDER: "Nhắc Kế hoạch tuần sắp hết hạn",
  KPI_REMINDER: "Nhắc KPI tháng chậm tiến độ",
  DEBT_WEEK_FOLLOWUP: "Công nợ cần thu trong tuần",
  DEBT_DUE_DATE_MISSING: "Hoá đơn thiếu hạn thanh toán",
  TRIP_REPORT_DUE: "Nhắc nộp báo cáo công tác",
  TRIP_NEXT_STEP_DUE: "Việc tiếp theo sau buổi gặp khách",
  TRIP_REVIEW_PENDING: "Báo cáo công tác chờ duyệt (quản trị viên)",
  TRIP_REVIEWED: "Kết quả duyệt báo cáo công tác",
  ADMIN_KPI_DAILY: "Điểm KPI tuần Admin kinh doanh hằng ngày",
  DELAY_REASON_PENDING: "Lý do giao trễ chờ duyệt (quản trị viên)",
  CUSTOMER_RISK: "Khách có dấu hiệu giảm/ngừng mua",
  SEASON_REMINDER: "Khách mua theo vụ sắp tới vụ",
};

/** Mã liên kết 6 chữ số, hết hạn sau 10 phút. */
export function newLinkCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
export const LINK_CODE_TTL_MS = 10 * 60_000;
