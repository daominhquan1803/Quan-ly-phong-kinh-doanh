import { prisma } from "@hoanggia/db";
import { logger } from "../logger";

/** Ảnh minh chứng chăm sóc tải lên mà không được gắn vào lần ghi nào (bỏ dở, gỡ nhầm) — xoá sau 24 giờ cho nhẹ database. */
export async function runCarePhotoCleanup(): Promise<{ deleted: number }> {
  const { count } = await prisma.careLogPhoto.deleteMany({ where: { logId: null, createdAt: { lt: new Date(Date.now() - 24 * 3600_000) } } });
  if (count) logger.info(`Dọn ảnh chăm sóc chưa gắn lần ghi: xoá ${count} ảnh.`);
  return { deleted: count };
}
