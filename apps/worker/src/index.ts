import cron from "node-cron";
import { buildServer } from "./server";
import { runAmisOrderSync, runPurchaseHistoryBackfillIfNeeded } from "./sync/amis";
import { runQuoteSync } from "./sync/quotes";
import { runBaoGiaAppSync, isBaoGiaAppConfigured } from "./sync/baoGiaApp";
import { runWeekPlanReminder } from "./notifications/weekPlanReminder";
import { runKpiReminder } from "./notifications/kpiReminder";
import { runDebtDueReminder } from "./notifications/debtDueReminder";
import { runTripReminder } from "./notifications/tripReminder";
import { runWeekPlanDigest } from "./notifications/weekPlanDigest";
import { runDebtWeekReminder } from "./notifications/debtWeekReminder";
import { runZaloDispatch } from "./notifications/zaloDispatch";
import { runAdminKpiDigest } from "./notifications/adminKpiDigest";
import { runCustomerAlerts } from "./notifications/customerAlerts";
import { runCareDaily, runCareEscalations } from "./notifications/carePlan";
import { runWeekPlanFollowup } from "./notifications/weekPlanFollowup";
import { runCarePhotoCleanup } from "./notifications/carePhotoCleanup";
import { runCustomerReportSnapshot } from "./notifications/customerReportSnapshot";
import { isZaloConfigured } from "./zalo";
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

  // App báo giá (từ 10/10/2026): đọc file dữ liệu chỉ-đọc, 10 phút/lần — lần nào không có thay đổi thì không ghi log.
  if (isBaoGiaAppConfigured()) {
    const BAO_GIA_CRON = process.env.BAO_GIA_SYNC_CRON || "*/10 * * * *";
    cron.schedule(
      BAO_GIA_CRON,
      () => {
        runBaoGiaAppSync("CRON").catch((err) => logger.error("Lỗi cron đồng bộ app báo giá:", err));
      },
      { timezone: QUOTE_CRON_TIMEZONE }
    );
    logger.info(`Đã lên lịch đồng bộ từ app báo giá: "${BAO_GIA_CRON}"`);
    // Chạy 1 lần ngay khi worker khởi động để dữ liệu có sẵn, không phải đợi tới mốc 10 phút đầu tiên.
    runBaoGiaAppSync("CRON").catch((err) => logger.error("Lỗi đồng bộ app báo giá khi khởi động:", err));
  } else {
    logger.warn("Chưa cấu hình BAO_GIA_DB_PATH — bỏ qua đồng bộ báo giá từ app báo giá.");
  }

  cron.schedule(
    NOTIFY_CRON,
    () => {
      logger.info("Cron kích hoạt kiểm tra nhắc việc (Kế hoạch tuần + KPI tháng + Công nợ tới hạn)");
      runWeekPlanReminder().catch((err) => logger.error("Lỗi nhắc việc Kế hoạch tuần:", err));
      runKpiReminder().catch((err) => logger.error("Lỗi nhắc việc KPI tháng:", err));
      runDebtDueReminder().catch((err) => logger.error("Lỗi nhắc công nợ tới hạn:", err));
      runTripReminder().catch((err) => logger.error("Lỗi nhắc công tác:", err));
      runWeekPlanDigest().catch((err) => logger.error("Lỗi tin điểm Kế hoạch tuần hằng ngày:", err));
      runDebtWeekReminder().catch((err) => logger.error("Lỗi nhắc công nợ đầu tuần:", err));
      runAdminKpiDigest().catch((err) => logger.error("Lỗi tin KPI Admin hằng ngày:", err));
      runCustomerAlerts().catch((err) => logger.error("Lỗi cảnh báo khách hàng:", err));
      runCareDaily().catch((err) => logger.error("Lỗi lịch chăm sóc 8h:", err));
      runWeekPlanFollowup().catch((err) => logger.error("Lỗi nhắc hành động tiếp theo kế hoạch tuần:", err));
    },
    { timezone: NOTIFY_CRON_TIMEZONE }
  );

  // 05:30 ngày 1 hằng tháng: chụp báo cáo Danh sách khách hàng (tiến trình/tình trạng cuối tháng trước) để so sánh.
  cron.schedule(
    "30 5 1 * *",
    () => {
      runCustomerReportSnapshot().catch((err) => logger.error("Lỗi chụp báo cáo danh sách khách:", err));
    },
    { timezone: NOTIFY_CRON_TIMEZONE }
  );

  // Quét nhanh đơn AMIS mỗi 15 phút trong giờ làm việc (Thứ Hai–Thứ Bảy, 7h–18h) để trang Đơn hàng thấy đơn mới kịp tính hạn xác nhận 2 giờ.
  if (process.env.AMIS_APP_ID && process.env.AMIS_CLIENT_SECRET) {
    cron.schedule(
      "*/15 7-18 * * 1-6",
      () => {
        runAmisOrderSync("CRON-NHANH", { light: true }).catch((err) => logger.error("Lỗi quét nhanh đơn hàng AMIS:", err));
      },
      { timezone: AMIS_CRON_TIMEZONE }
    );
  }

  // 02:30 mỗi ngày: nạp lịch sử mua từ AMIS NẾU chưa từng nạp thành công (chạy 1 lần ngoài giờ làm việc, các ngày sau tự bỏ qua).
  cron.schedule(
    "30 2 * * *",
    () => {
      runPurchaseHistoryBackfillIfNeeded().catch((err) => logger.error("Lỗi nạp lịch sử mua từ AMIS:", err));
    },
    { timezone: NOTIFY_CRON_TIMEZONE }
  );

  // 03:20 mỗi ngày: xoá ảnh chăm sóc tải lên mà không gắn vào lần ghi nào (quá 24 giờ).
  cron.schedule(
    "20 3 * * *",
    () => {
      runCarePhotoCleanup().catch((err) => logger.error("Lỗi dọn ảnh chăm sóc:", err));
    },
    { timezone: NOTIFY_CRON_TIMEZONE }
  );

  // Cảnh báo chăm sóc leo thang cho trưởng phòng: quét 15 phút/lần (hàm tự giới hạn 7h30–18h, trừ Chủ nhật).
  cron.schedule(
    "*/15 * * * *",
    () => {
      runCareEscalations().catch((err) => logger.error("Lỗi cảnh báo chăm sóc:", err));
    },
    { timezone: NOTIFY_CRON_TIMEZONE }
  );

  // Gửi Zalo mỗi phút cho mọi thông báo mới (do web hoặc worker tạo) — chỉ khi đã cấu hình bot.
  if (isZaloConfigured()) {
    cron.schedule("* * * * *", () => {
      runZaloDispatch().catch((err) => logger.error("Lỗi gửi Zalo:", err));
    });
    logger.info("Đã bật gửi thông báo qua Zalo Bot (quét mỗi phút, khung 7h–20h).");
  } else {
    logger.warn("Chưa cấu hình ZALO_BOT_TOKEN — bỏ qua gửi thông báo qua Zalo.");
  }
  logger.info(`Đã lên lịch kiểm tra nhắc việc + công nợ tới hạn: "${NOTIFY_CRON}" (múi giờ ${NOTIFY_CRON_TIMEZONE})`);
}

main().catch((err) => {
  logger.error("Worker khởi động thất bại:", err);
  process.exit(1);
});
