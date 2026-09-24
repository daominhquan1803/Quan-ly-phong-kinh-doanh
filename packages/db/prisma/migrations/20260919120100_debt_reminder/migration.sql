-- AlterTable
ALTER TABLE "customers" ADD COLUMN "email" TEXT;

-- CreateTable
CREATE TABLE "debt_reminder_logs" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "milestone" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "recipients" TEXT NOT NULL,
    "ccRecipients" TEXT,
    "triggeredBy" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debt_reminder_logs_invoiceId_milestone_dueDate_key" ON "debt_reminder_logs"("invoiceId", "milestone", "dueDate");

-- CreateIndex
CREATE INDEX "debt_reminder_logs_sentAt_idx" ON "debt_reminder_logs"("sentAt");

-- AddForeignKey
ALTER TABLE "debt_reminder_logs" ADD CONSTRAINT "debt_reminder_logs_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "debt_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
