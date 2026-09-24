-- AlterTable
ALTER TABLE "customers" ADD COLUMN "manualOverdueReminderBase" INTEGER;

-- AlterTable
ALTER TABLE "debt_reminder_logs" ADD COLUMN "displayOccurrence" INTEGER;
