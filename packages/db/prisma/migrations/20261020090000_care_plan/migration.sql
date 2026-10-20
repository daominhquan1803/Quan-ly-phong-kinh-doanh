-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CARE_DUE_DAILY';
ALTER TYPE "NotificationType" ADD VALUE 'CARE_ESCALATION';
ALTER TYPE "NotificationType" ADD VALUE 'CARE_WEEKLY';
ALTER TYPE "CareOutcome" ADD VALUE 'RESOLVED';

-- CreateTable
CREATE TABLE "care_spot_checks" (
    "id" TEXT NOT NULL,
    "logId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "note" TEXT,
    "checkedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_spot_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "care_spot_checks_logId_key" ON "care_spot_checks"("logId");

-- AddForeignKey
ALTER TABLE "care_spot_checks" ADD CONSTRAINT "care_spot_checks_logId_fkey" FOREIGN KEY ("logId") REFERENCES "customer_care_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "care_spot_checks" ADD CONSTRAINT "care_spot_checks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
