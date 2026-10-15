import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { prisma, QuoteStatus } from "@hoanggia/db";
import { logger } from "../logger";
import { AppQuoteItem, AppQuoteRow, cutoffMs, mapAppQuote } from "./baoGiaMapping";

export interface SyncOutcome {
  status: "SUCCESS" | "FAILED";
  recordsSynced: number;
  message?: string;
}

// Đường dẫn file SQLite của APP BÁO GIÁ (mount chỉ-đọc vào container worker — xem infra/docker-compose.yml). Không đặt =
// bỏ qua đồng bộ (vd máy dev không có app báo giá).
const BAO_GIA_DB_PATH = process.env.BAO_GIA_DB_PATH;
// Chỉ lấy báo giá của phòng kinh doanh mình quản lý (cùng nguyên tắc với bản Google Sheet: chỉ PKD1).
const BAO_GIA_DEPARTMENT = process.env.BAO_GIA_DEPARTMENT || "PKD1";

export function isBaoGiaAppConfigured(): boolean {
  return !!BAO_GIA_DB_PATH;
}

const normCode = (s: string) => s.replace(/[^a-z0-9]/gi, "").toUpperCase();

/**
 * Đọc báo giá + mã hàng từ file SQLite của app báo giá. Sao chép file ra thư mục tạm rồi mở bản sao ở chế độ chỉ-đọc —
 * không bao giờ ghi vào file gốc và không tranh khoá với app báo giá đang chạy.
 */
export function readBaoGiaApp(dbPath: string, fromMs: number, department: string): { rows: AppQuoteRow[]; items: Map<string, AppQuoteItem[]> } {
  // Nạp lười (không import tĩnh): node:sqlite chỉ cần khi thực sự đọc file, và cách này giúp test/Vite không phải xử lý module built-in thử nghiệm này.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
  const tmp = path.join(os.tmpdir(), `baogia-${process.pid}-${Date.now()}.db`);
  fs.copyFileSync(dbPath, tmp);
  const db = new DatabaseSync(tmp, { readOnly: true });
  try {
    const rawRows = db
      .prepare(
        `SELECT r.id AS id, r.code AS code, r.status AS status, r.finalResult AS finalResult, r.requestedAt AS requestedAt,
                r.updatedAt AS updatedAt, r.notes AS notes, r.deliveryAddress AS deliveryAddress, r.potentialItems AS potentialItems,
                c.name AS customerName, c.type AS customerType, c.industry AS customerIndustry, c.nationality AS customerNationality,
                c.scale AS customerScale, c.deliveryAddress AS customerAddress,
                u.username AS salesUsername, p.fullName AS pkhName
         FROM QuoteRequest r
         JOIN Customer c ON c.id = r.customerId
         JOIN User u ON u.id = r.salesId
         LEFT JOIN Department d ON d.id = u.departmentId
         LEFT JOIN User p ON p.id = r.pkhStaffId
         WHERE r.requestedAt >= ? AND d.code = ?`
      )
      .all(fromMs, department);
    const rawItems = db
      .prepare(
        `SELECT i.quoteRequestId AS quoteId, i.itemName AS itemName, i.quantity AS quantity, i.unit AS unit,
                i.unitPriceL1 AS unitPriceL1, i.unitPriceL2 AS unitPriceL2, i.feedbackL1 AS feedbackL1, i.feedbackL2 AS feedbackL2
         FROM QuoteItem i
         JOIN QuoteRequest r ON r.id = i.quoteRequestId
         JOIN User u ON u.id = r.salesId
         LEFT JOIN Department d ON d.id = u.departmentId
         WHERE r.requestedAt >= ? AND d.code = ?
         ORDER BY i.createdAt`
      )
      .all(fromMs, department);

    const items = new Map<string, AppQuoteItem[]>();
    for (const it of rawItems) {
      const key = String(it.quoteId);
      const list = items.get(key) ?? [];
      list.push({
        itemName: String(it.itemName ?? ""),
        quantity: Number(it.quantity ?? 0),
        unit: String(it.unit ?? ""),
        unitPriceL1: it.unitPriceL1 == null ? null : Number(it.unitPriceL1),
        unitPriceL2: it.unitPriceL2 == null ? null : Number(it.unitPriceL2),
        feedbackL1: it.feedbackL1 == null ? null : String(it.feedbackL1),
        feedbackL2: it.feedbackL2 == null ? null : String(it.feedbackL2),
      });
      items.set(key, list);
    }
    const rows: (AppQuoteRow & { id: string })[] = rawRows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      status: String(r.status),
      finalResult: r.finalResult == null ? null : String(r.finalResult),
      requestedAt: Number(r.requestedAt),
      updatedAt: Number(r.updatedAt),
      notes: r.notes == null ? null : String(r.notes),
      deliveryAddress: r.deliveryAddress == null ? null : String(r.deliveryAddress),
      potentialItems: r.potentialItems == null ? null : String(r.potentialItems),
      customerName: String(r.customerName),
      customerType: r.customerType == null ? null : String(r.customerType),
      customerIndustry: r.customerIndustry == null ? null : String(r.customerIndustry),
      customerNationality: r.customerNationality == null ? null : String(r.customerNationality),
      customerScale: r.customerScale == null ? null : String(r.customerScale),
      customerAddress: r.customerAddress == null ? null : String(r.customerAddress),
      salesUsername: String(r.salesUsername),
      pkhName: r.pkhName == null ? null : String(r.pkhName),
    }));
    return { rows, items: new Map(rows.map((r) => [r.code, items.get(r.id) ?? []])) };
  } finally {
    db.close();
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Đồng bộ báo giá TỪ 10/10/2026 từ app báo giá (xem QUOTE_APP_CUTOFF) vào bảng quote_requests: upsert theo mã BG-xx-xxxx
 * (chỉ ghi dòng mới/đã đổi so với updatedAt bên app báo giá), xoá dòng đã bị xoá bên app báo giá. Chạy 10 phút/lần nên
 * lần chạy từ cron mà không có gì thay đổi thì KHÔNG ghi SyncLog (tránh ~144 dòng log/ngày).
 */
export async function runBaoGiaAppSync(
  triggeredBy: string,
  read: typeof readBaoGiaApp = readBaoGiaApp
): Promise<SyncOutcome> {
  if (!BAO_GIA_DB_PATH) {
    return { status: "SUCCESS", recordsSynced: 0, message: "Chưa cấu hình BAO_GIA_DB_PATH — bỏ qua đồng bộ từ app báo giá." };
  }
  const quiet = triggeredBy === "CRON";
  let syncLogId: string | null = null;
  try {
    const { rows, items } = read(BAO_GIA_DB_PATH, cutoffMs(), BAO_GIA_DEPARTMENT);

    const users = await prisma.user.findMany({ where: { quoteAssigneeCode: { not: null } }, select: { quoteAssigneeCode: true } });
    const canonical = new Map(users.map((u) => [normCode(u.quoteAssigneeCode as string), u.quoteAssigneeCode as string]));
    const assigneeCodeFor = (username: string) => canonical.get(normCode(username)) ?? username.toUpperCase();

    const mapped = rows.map((r) => mapAppQuote(r, items.get(r.code) ?? [], assigneeCodeFor));
    const existing = await prisma.quoteRequest.findMany({
      where: { sourceApp: "BAOGIA_APP" },
      select: { sourceCode: true, sourceUpdatedAt: true },
    });
    const existingByCode = new Map(existing.map((e) => [e.sourceCode as string, e.sourceUpdatedAt?.getTime() ?? null]));
    const currentCodes = new Set(mapped.map((m) => m.sourceCode));

    const toWrite = mapped.filter((m) => existingByCode.get(m.sourceCode) !== m.sourceUpdatedAt.getTime());
    const toDelete = existing.map((e) => e.sourceCode as string).filter((c) => !currentCodes.has(c));
    if (toWrite.length === 0 && toDelete.length === 0) {
      const message = `App báo giá: ${mapped.length} báo giá, không có thay đổi.`;
      if (quiet) {
        logger.info(message);
        return { status: "SUCCESS", recordsSynced: 0, message };
      }
    }

    const log = await prisma.syncLog.create({ data: { jobType: "QUOTE_SYNC", status: "RUNNING", triggeredBy } });
    syncLogId = log.id;
    await prisma.$transaction([
      ...toWrite.map((m) => {
        const data = { ...m, status: m.status as QuoteStatus };
        return prisma.quoteRequest.upsert({
          where: { sourceApp_sourceCode: { sourceApp: "BAOGIA_APP", sourceCode: m.sourceCode } },
          create: data,
          update: data,
        });
      }),
      ...(toDelete.length ? [prisma.quoteRequest.deleteMany({ where: { sourceApp: "BAOGIA_APP", sourceCode: { in: toDelete } } })] : []),
    ]);

    const message = `Đã đồng bộ từ app báo giá: ${mapped.length} báo giá (thêm/cập nhật ${toWrite.length}, xoá ${toDelete.length}).`;
    logger.info(message);
    await prisma.syncLog.update({ where: { id: log.id }, data: { status: "SUCCESS", finishedAt: new Date(), recordsSynced: toWrite.length, message } });
    return { status: "SUCCESS", recordsSynced: toWrite.length, message };
  } catch (err) {
    const message = `Đồng bộ từ app báo giá thất bại: ${err instanceof Error ? err.message : "Lỗi không xác định"}`;
    logger.error(message);
    if (syncLogId) {
      await prisma.syncLog.update({ where: { id: syncLogId }, data: { status: "FAILED", finishedAt: new Date(), message } }).catch(() => undefined);
    } else {
      await prisma.syncLog.create({ data: { jobType: "QUOTE_SYNC", status: "FAILED", finishedAt: new Date(), message, triggeredBy } }).catch(() => undefined);
    }
    return { status: "FAILED", recordsSynced: 0, message };
  }
}
