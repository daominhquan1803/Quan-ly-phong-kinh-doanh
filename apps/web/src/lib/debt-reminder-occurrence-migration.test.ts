import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";

// Kiểm CẤU TRÚC migration thứ 3 (occurrence) bằng cách đọc file .sql thật — KHÔNG chạy migration lên
// DB (cấm theo yêu cầu). Chỉ xác nhận: đúng nội dung mong đợi (ADD COLUMN + đổi index), không có lệnh
// phá dữ liệu, và 2 migration cũ không bị đụng tới.

const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../packages/db/prisma/migrations");
const OCCURRENCE_DIR = "20260923090000_debt_reminder_occurrence";
const OLD_NOTIFICATION_TYPE_DIR = "20260919120000_debt_reminder_notification_type";
const OLD_DEBT_REMINDER_DIR = "20260919120100_debt_reminder";

function readMigration(dir: string): string {
  return readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
}

describe("Migration thứ 3 (occurrence) - cấu trúc file SQL", () => {
  it("thư mục migration tồn tại, tên đúng định dạng YYYYMMDDHHMMSS_mo_ta", () => {
    const dirs = readdirSync(MIGRATIONS_DIR);
    expect(dirs).toContain(OCCURRENCE_DIR);
    expect(OCCURRENCE_DIR).toMatch(/^\d{14}_[a-z0-9_]+$/);
  });

  it("chỉ có đúng 3 câu lệnh: ADD COLUMN, DROP INDEX cũ, CREATE UNIQUE INDEX mới", () => {
    const sql = readMigration(OCCURRENCE_DIR);
    const withoutComments = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    const statements = withoutComments
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
    expect(statements).toHaveLength(3);
    expect(statements[0]).toBe('ALTER TABLE "debt_reminder_logs" ADD COLUMN "occurrence" INTEGER NOT NULL DEFAULT 1');
    expect(statements[1]).toBe('DROP INDEX "debt_reminder_logs_invoiceId_milestone_dueDate_key"');
    expect(statements[2]).toBe(
      'CREATE UNIQUE INDEX "debt_reminder_logs_invoiceId_milestone_dueDate_occurrence_key" ON "debt_reminder_logs"("invoiceId", "milestone", "dueDate", "occurrence")'
    );
  });

  it("cột occurrence NOT NULL kèm DEFAULT 1 -> dữ liệu cũ (log OVERDUE trước đây chỉ gửi ở ngày quá hạn 1) tự coi là lần 1, không cần backfill tay", () => {
    const sql = readMigration(OCCURRENCE_DIR);
    expect(sql).toMatch(/ADD COLUMN "occurrence" INTEGER NOT NULL DEFAULT 1/);
  });

  it("index bị DROP đúng là index unique cũ mà migration đợt 1 đã tạo (không đoán sai tên)", () => {
    const oldSql = readMigration(OLD_DEBT_REMINDER_DIR);
    const dropped = readMigration(OCCURRENCE_DIR).match(/DROP INDEX "([^"]+)"/)?.[1];
    expect(dropped).toBeDefined();
    expect(oldSql).toContain(`CREATE UNIQUE INDEX "${dropped}"`);
  });

  it("KHÔNG có lệnh phá dữ liệu (DROP TABLE / TRUNCATE / DELETE FROM / DROP COLUMN)", () => {
    const sql = readMigration(OCCURRENCE_DIR).toUpperCase();
    for (const dangerous of ["DROP TABLE", "TRUNCATE", "DELETE FROM", "DROP COLUMN", "CASCADE"]) {
      expect(sql).not.toContain(dangerous);
    }
  });

  it("KHÔNG sửa 2 migration của đợt 1 (nội dung y hệt lúc đợt 1 tạo ra)", () => {
    expect(readMigration(OLD_NOTIFICATION_TYPE_DIR).trim()).toBe(`-- AlterEnum\nALTER TYPE "NotificationType" ADD VALUE 'DEBT_DUE_DATE_MISSING';`.trim());
    const oldDebtReminder = readMigration(OLD_DEBT_REMINDER_DIR);
    expect(oldDebtReminder).toContain('ALTER TABLE "customers" ADD COLUMN "email" TEXT;');
    expect(oldDebtReminder).toContain('CREATE TABLE "debt_reminder_logs"');
    expect(oldDebtReminder).not.toContain("occurrence");
  });

  it("chạy SAU 2 migration đợt 1 theo thứ tự tên thư mục (timestamp lớn hơn)", () => {
    expect(OCCURRENCE_DIR > OLD_DEBT_REMINDER_DIR).toBe(true);
    expect(OCCURRENCE_DIR > OLD_NOTIFICATION_TYPE_DIR).toBe(true);
  });
});

describe("schema.prisma - model DebtReminderLog khớp với migration", () => {
  const SCHEMA_PATH = path.resolve(__dirname, "../../../../packages/db/prisma/schema.prisma");
  const schema = readFileSync(SCHEMA_PATH, "utf8");
  const modelMatch = schema.match(/model DebtReminderLog \{[\s\S]*?\n\}/);
  const model = modelMatch ? modelMatch[0] : "";

  it("model tồn tại và có field occurrence Int @default(1)", () => {
    expect(model).not.toBe("");
    expect(model).toMatch(/occurrence\s+Int\s+@default\(1\)/);
  });

  it("khoá unique đúng 4 phần (invoiceId, milestone, dueDate, occurrence), đúng thứ tự", () => {
    expect(model).toMatch(/@@unique\(\[invoiceId,\s*milestone,\s*dueDate,\s*occurrence\]\)/);
  });

  it("KHÔNG còn khoá unique 3 phần cũ (đã bị thay hẳn, không phải thêm khoá song song)", () => {
    expect(model).not.toMatch(/@@unique\(\[invoiceId,\s*milestone,\s*dueDate\]\)/);
  });
});
