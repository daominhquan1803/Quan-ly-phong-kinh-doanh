import cron from "node-cron";
import { buildServer } from "./server";
import { runAmisOrderSync } from "./sync/amis";
import { runQuoteSync } from "./sync/quotes";
import { runWeekPlanReminder } from "./notifications/weekPlanReminder";
import { runKpiReminder } from "./notifications/kpiReminder";
import { runDebtDueReminder } from "./notifications/debtDueReminder";
import { logger } from "./logger";

const PORT = Number(process.env.WORKER_PORT || 4001);
// Đồng bộ đơn hàng AMIS 1 lần/ngày (trước đây mỗi 15 phút) — có nút "Đồng bộ AMIS" ở trang
// Đơn hàng/Tiến độ giao hàng để đồng bộ thủ công ngay khi cần, không phải đợi lịch.
const AMIS_CRON = process.env.AMIS_SYNC_CRON || "0 6 * * *"; // 06:00 giờ Việt Nam hàng ngày
const AMIS_CRON_TIMEZONE = process.env.AMIS_SYNC_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";
const QUOTE_CRON = process.env.QUOTE_SYNC_CRON || "15 6 * * *"; // 06:15 hàng ngày
const QUOTE_CRON_TIMEZONE = process.env.QUOTE_SYNC_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";
// Nhắc việc (Kế hoạch tuần sắp hết hạn + KPI tháng chậm tiến độ) — kiểm tra mỗi sáng, tự bỏ qua
// nếu chưa đúng mốc ngày cần nhắc (xem logic trong 2 module notifications/*).
const NOTIFY_CRON = process.env.NOTIFY_CRON || "0 8 * * *"; // 08:00 giờ Việt Nam hàng ngày
const NOTIFY_CRON_TIMEZONE = process.env.NOTIFY_CRON_TIMEZONE || "Asia/Ho_Chi_Minh";

async function main() {
  const app = buildServer();
  await app.listen({ host: "0.0.0.0", port: PORT });
  logger.info(`Worker HTTP server đang chạy tại cổng ${PORT}`);

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

  cron.schedule(
    NOTIFY_CRON,
    () => {
      logger.info("Cron kích hoạt kiểm tra nhắc việc (Kế hoạch tuần + KPI tháng + Công nợ tới hạn)");
      runWeekPlanReminder().catch((err) => logger.error("Lỗi nhắc việc Kế hoạch tuần:", err));
      runKpiReminder().catch((err) => logger.error("Lỗi nhắc việc KPI tháng:", err));
      runDebtDueReminder().catch((err) => logger.error("Lỗi nhắc công nợ tới hạn:", err));
    },
    { timezone: NOTIFY_CRON_TIMEZONE }
  );
  logger.info(`Đã lên lịch kiểm tra nhắc việc + công nợ tới hạn: "${NOTIFY_CRON}" (múi giờ ${NOTIFY_CRON_TIMEZONE})`);
}

main().catch((err) => {
  logger.error("Worker khởi động thất bại:", err);
  process.exit(1);
});
