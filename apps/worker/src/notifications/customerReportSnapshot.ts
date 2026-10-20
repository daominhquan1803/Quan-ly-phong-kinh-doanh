import { logger } from "../logger";

const WEB_INTERNAL_URL = process.env.WEB_INTERNAL_URL || "http://web:3000";
const INTERNAL_SYNC_TOKEN = process.env.INTERNAL_SYNC_TOKEN;

/** Ngày 1 hằng tháng: chụp báo cáo Danh sách khách hàng làm số liệu "tháng trước" (tiến trình, tình trạng) để so sánh. */
export async function runCustomerReportSnapshot(): Promise<void> {
  if (!INTERNAL_SYNC_TOKEN) return;
  const res = await fetch(`${WEB_INTERNAL_URL}/api/internal/customer-report-snapshot`, {
    method: "POST",
    headers: { "x-internal-token": INTERNAL_SYNC_TOKEN },
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`customer-report-snapshot trả về ${res.status}`);
  const j = (await res.json()) as { year: number; month: number; customers: number };
  logger.info(`Đã chụp báo cáo Danh sách khách hàng tháng ${j.month}/${j.year}: ${j.customers} khách.`);
}
