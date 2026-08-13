import cron from "node-cron";
import { buildServer } from "./server";
import { runDebtSync } from "./scraper/hienvi";
import { logger } from "./logger";

const PORT = Number(process.env.WORKER_PORT || 4001);
const CRON_SCHEDULE = process.env.HIENVI_SYNC_CRON || "30 6 * * *"; // 06:30 hàng ngày

async function main() {
  const app = buildServer();
  await app.listen({ host: "0.0.0.0", port: PORT });
  logger.info(`Worker HTTP server đang chạy tại cổng ${PORT}`);

  cron.schedule(CRON_SCHEDULE, () => {
    logger.info("Cron kích hoạt đồng bộ công nợ hàng ngày");
    runDebtSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ công nợ:", err));
  });
  logger.info(`Đã lên lịch đồng bộ công nợ: "${CRON_SCHEDULE}"`);
}

main().catch((err) => {
  logger.error("Worker khởi động thất bại:", err);
  process.exit(1);
});
