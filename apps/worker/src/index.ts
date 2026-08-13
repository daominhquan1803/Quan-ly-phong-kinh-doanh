import cron from "node-cron";
import { buildServer } from "./server";
import { runDebtSync } from "./scraper/hienvi";
import { runAmisOrderSync } from "./sync/amis";
import { logger } from "./logger";

const PORT = Number(process.env.WORKER_PORT || 4001);
const HIENVI_CRON = process.env.HIENVI_SYNC_CRON || "30 6 * * *"; // 06:30 hàng ngày
const AMIS_CRON = process.env.AMIS_SYNC_CRON || "*/15 * * * *"; // mỗi 15 phút

async function main() {
  const app = buildServer();
  await app.listen({ host: "0.0.0.0", port: PORT });
  logger.info(`Worker HTTP server đang chạy tại cổng ${PORT}`);

  cron.schedule(HIENVI_CRON, () => {
    logger.info("Cron kích hoạt đồng bộ công nợ hàng ngày");
    runDebtSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ công nợ:", err));
  });
  logger.info(`Đã lên lịch đồng bộ công nợ: "${HIENVI_CRON}"`);

  if (process.env.AMIS_APP_ID && process.env.AMIS_CLIENT_SECRET) {
    cron.schedule(AMIS_CRON, () => {
      logger.info("Cron kích hoạt đồng bộ đơn hàng AMIS");
      runAmisOrderSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ đơn hàng AMIS:", err));
    });
    logger.info(`Đã lên lịch đồng bộ đơn hàng AMIS: "${AMIS_CRON}"`);
  } else {
    logger.warn("Chưa cấu hình AMIS_APP_ID/AMIS_CLIENT_SECRET — bỏ qua lịch đồng bộ đơn hàng AMIS.");
  }
}

main().catch((err) => {
  logger.error("Worker khởi động thất bại:", err);
  process.exit(1);
});
