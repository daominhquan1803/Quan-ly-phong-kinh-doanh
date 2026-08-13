import Fastify from "fastify";
import { runDebtSync } from "./scraper/hienvi";
import { logger } from "./logger";

export function buildServer() {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true }));

  app.post("/sync", async (req, reply) => {
    const token = req.headers["x-internal-token"];
    if (!process.env.INTERNAL_SYNC_TOKEN || token !== process.env.INTERNAL_SYNC_TOKEN) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const triggeredBy = (req.body as { triggeredBy?: string } | undefined)?.triggeredBy ?? "MANUAL";
    logger.info(`Nhận yêu cầu đồng bộ công nợ thủ công từ: ${triggeredBy}`);
    const outcome = await runDebtSync(triggeredBy);

    if (outcome.status === "FAILED") {
      reply.code(502);
    }
    return outcome;
  });

  return app;
}
