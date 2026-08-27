import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { runDebtSync } from "./scraper/hienvi";
import { runAmisOrderSync } from "./sync/amis";
import { runQuoteSync } from "./sync/quotes";
import { runWeekPlanReminder } from "./notifications/weekPlanReminder";
import { runKpiReminder } from "./notifications/kpiReminder";
import { logger } from "./logger";

function checkInternalToken(req: FastifyRequest, reply: FastifyReply): boolean {
  const token = req.headers["x-internal-token"];
  if (!process.env.INTERNAL_SYNC_TOKEN || token !== process.env.INTERNAL_SYNC_TOKEN) {
    reply.code(401).send({ error: "Unauthorized" });
    return false;
  }
  return true;
}

export function buildServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  app.post("/sync", async (req, reply) => {
    if (!checkInternalToken(req, reply)) return;
    const triggeredBy = (req.body as { triggeredBy?: string } | undefined)?.triggeredBy ?? "MANUAL";
    logger.info(`Nhận yêu cầu đồng bộ công nợ thủ công từ: ${triggeredBy}`);
    const outcome = await runDebtSync(triggeredBy);
    if (outcome.status === "FAILED") reply.code(502);
    return outcome;
  });

  app.post("/sync-amis", async (req, reply) => {
    if (!checkInternalToken(req, reply)) return;
    const triggeredBy = (req.body as { triggeredBy?: string } | undefined)?.triggeredBy ?? "MANUAL";
    logger.info(`Nhận yêu cầu đồng bộ đơn hàng AMIS thủ công từ: ${triggeredBy}`);
    const outcome = await runAmisOrderSync(triggeredBy);
    if (outcome.status === "FAILED") reply.code(502);
    return outcome;
  });

  app.post("/sync-quotes", async (req, reply) => {
    if (!checkInternalToken(req, reply)) return;
    const triggeredBy = (req.body as { triggeredBy?: string } | undefined)?.triggeredBy ?? "MANUAL";
    logger.info(`Nhận yêu cầu đồng bộ Báo giá thủ công từ: ${triggeredBy}`);
    const outcome = await runQuoteSync(triggeredBy);
    if (outcome.status === "FAILED") reply.code(502);
    return outcome;
  });

  // 2 endpoint dưới đây để TEST thủ công logic nhắc việc (bấm bất kỳ lúc nào, không cần đợi
  // đúng mốc 08:00/đúng ngày còn 1-3 ngày là hết hạn) — bản thân runWeekPlanReminder/runKpiReminder
  // vẫn tự kiểm tra mốc ngày bên trong, gọi thủ công KHÔNG bỏ qua điều kiện đó.
  app.post("/notify-week-plan", async (req, reply) => {
    if (!checkInternalToken(req, reply)) return;
    logger.info("Nhận yêu cầu kiểm tra nhắc việc Kế hoạch tuần thủ công");
    try {
      return await runWeekPlanReminder();
    } catch (err) {
      reply.code(502);
      return { error: err instanceof Error ? err.message : "Lỗi không xác định" };
    }
  });

  app.post("/notify-kpi", async (req, reply) => {
    if (!checkInternalToken(req, reply)) return;
    logger.info("Nhận yêu cầu kiểm tra nhắc việc KPI tháng thủ công");
    try {
      return await runKpiReminder();
    } catch (err) {
      reply.code(502);
      return { error: err instanceof Error ? err.message : "Lỗi không xác định" };
    }
  });

  return app;
}
