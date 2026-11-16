import { logger } from "../logger";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;

/**
 * Kéo Google Sheet "Theo dõi khách tiềm năng - PKD1" vào app (bài quét FB, khách quét báo, khách tự tìm, nhật ký quét).
 * Việc đọc + nhập nằm ở web (apps/web/src/lib/lead-scan-data.ts) — worker chỉ đặt lịch và gọi API nội bộ.
 */
export async function runLeadSheetSync(): Promise<void> {
  if (!INTERNAL_SYNC_TOKEN) {
    logger.warn("Thiếu INTERNAL_SYNC_TOKEN — bỏ qua đồng bộ Google Sheet khách tiềm năng.");
    return;
  }
  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/lead-sheet-sync`, {
    method: "POST",
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(180_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string; fb?: { total: number }; prospects?: { total: number }; logs?: number; unmatchedNames?: string[] };
  if (!res.ok) throw new Error(json.error ?? `lead-sheet-sync trả về ${res.status}`);
  logger.info(`Đồng bộ Google Sheet khách tiềm năng: ${json.fb?.total ?? 0} bài FB, ${json.prospects?.total ?? 0} khách, ${json.logs ?? 0} lượt quét.`);
  if (json.unmatchedNames?.length) logger.warn(`Tên NVKD trong sheet chưa khớp nhân viên: ${json.unmatchedNames.join(", ")}`);
}
