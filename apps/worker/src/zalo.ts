// Gửi tin qua Zalo Bot API. Chưa cấu hình ZALO_BOT_TOKEN thì bỏ qua (không ném lỗi), giống push.ts/email.ts.
const BASE = "https://bot-api.zaloplatforms.com";

export function isZaloConfigured(): boolean {
  return !!process.env.ZALO_BOT_TOKEN;
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
