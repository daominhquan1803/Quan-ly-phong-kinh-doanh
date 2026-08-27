import cron from "node-cron";
import { buildServer } from "./server";
import { runDebtSync } from "./scraper/hienvi";
import { runAmisOrderSync } from "./sync/amis";
import { runQuoteSync } from "./sync/quotes";
import { logger } from "./logger";

const PORT = Number(process.env.WORKER_PORT || 4001);
const HIENVI_CRON = process.env.HIENVI_SYNC_CRON || "30 6 * * *"; // 06:30 hàng ngày
const HIENVI_SYNC_ENABLED = process.env.HIENVI_SYNC_ENABLED !== "false";
// Đồng bộ đơn hàng AMIS 1 lần/ngày (trước đây mỗi 15 phút) — có nút "Đồng bộ AMIS" ở trang
// Đơn hàng/Tiến độ giao hàng để đồng bộ thủ công ngay khi cần, không phải đợi lịch.
const AMIS_CRON = process.env.AMIS_SYNC_CRON || "0 6 * * *"; // 06:00 giờ Việt Nam hàng ngày
const AMIS_CRON_TIMEZONE = process.env.AMIS_SYNC_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";
const QUOTE_CRON = process.env.QUOTE_SYNC_CRON || "15 6 * * *"; // 06:15 hàng ngày
const QUOTE_CRON_TIMEZONE = process.env.QUOTE_SYNC_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";

async function main() {
  const app = buildServer();
  await app.listen({ host: "0.0.0.0", port: PORT });
  logger.info(`Worker HTTP server đang chạy tại cổng ${PORT}`);

  if (HIENVI_SYNC_ENABLED) {
    cron.schedule(HIENVI_CRON, () => {
      logger.info("Cron kích hoạt đồng bộ công nợ hàng ngày");
      runDebtSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ công nợ:", err));
    });
    logger.info(`Đã lên lịch đồng bộ công nợ: "${HIENVI_CRON}"`);
  } else {
    logger.warn("Đồng bộ công nợ (hienvi.me) đang TẠM DỪNG (HIENVI_SYNC_ENABLED=false) — bỏ qua lịch cron.");
  }

  if (process.env.AMIS_APP_ID && process.env.AMIS_CLIENT_SECRET) {
    cron.schedule(
      AMIS_CRON,
      () => {
        logger.info("Cron kích hoạt đồng bộ đơn hàng AMIS");
        runAmisOrderSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ đơn hàng AMIS:", err));
      },
      { timezone: AMIS_CRON_TIMEZONE }
    );
    logger.info(`Đã lên lịch đồng bộ đơn hàng AMIS: "${AMIS_CRON}" (múi giờ ${AMIS_CRON_TIMEZONE})`);
  } else {
    logger.warn("Chưa cấu hình AMIS_APP_ID/AMIS_CLIENT_SECRET — bỏ qua lịch đồng bộ đơn hàng AMIS.");
  }

  if (process.env.GOOGLE_SHEETS_QUOTE_ID) {
    cron.schedule(
      QUOTE_CRON,
      () => {
        logger.info("Cron kích hoạt đồng bộ Báo giá");
        runQuoteSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ Báo giá:", err));
      },
      { timezone: QUOTE_CRON_TIMEZONE }
    );
    logger.info(`Đã lên lịch đồng bộ Báo giá: "${QUOTE_CRON}" (múi giờ ${QUOTE_CRON_TIMEZONE})`);
  } else {
    logger.warn("Chưa cấu hình GOOGLE_SHEETS_QUOTE_ID — bỏ qua lịch đồng bộ Báo giá.");
  }
}

main().catch((err) => {
  logger.error("Worker khởi động thất bại:", err);
  process.exit(1);
});
