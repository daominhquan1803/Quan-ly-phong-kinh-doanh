import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import { runDebtSync } from "./scraper/hienvi";
import { runAmisOrderSync } from "./sync/amis";
import { runQuoteSync } from "./sync/quotes";
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

  return app;
}
