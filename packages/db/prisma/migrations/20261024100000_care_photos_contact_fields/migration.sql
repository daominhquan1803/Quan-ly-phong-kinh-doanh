-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WEEK_PLAN_FOLLOWUP';

-- AlterTable
ALTER TABLE "week_plan_result_entries"
  ADD COLUMN "nationality" TEXT,
  ADD COLUMN "scale" TEXT,
  ADD COLUMN "contactName" TEXT,
  ADD COLUMN "contactPhone" TEXT,
  ADD COLUMN "need" TEXT,
  ADD COLUMN "workDone" TEXT,
  ADD COLUMN "nextAction" TEXT,
  ADD COLUMN "nextActionAt" TIMESTAMP(3),
  ADD COLUMN "followUpNotifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "care_log_photos" (
    "id" TEXT NOT NULL,
    "logId" TEXT,
    "uploaderId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_log_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_log_photos_logId_idx" ON "care_log_photos"("logId");

-- AddForeignKey
ALTER TABLE "care_log_photos" ADD CONSTRAINT "care_log_photos_logId_fkey" FOREIGN KEY ("logId") REFERENCES "customer_care_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
