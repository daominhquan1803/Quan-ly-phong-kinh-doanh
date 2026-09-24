-- AlterTable
ALTER TABLE "debt_reminder_logs" ADD COLUMN "occurrence" INTEGER NOT NULL DEFAULT 1;

-- DropIndex
DROP INDEX "debt_reminder_logs_invoiceId_milestone_dueDate_key";

-- CreateIndex
CREATE UNIQUE INDEX "debt_reminder_logs_invoiceId_milestone_dueDate_occurrence_key" ON "debt_reminder_logs"("invoiceId", "milestone", "dueDate", "occurrence");
