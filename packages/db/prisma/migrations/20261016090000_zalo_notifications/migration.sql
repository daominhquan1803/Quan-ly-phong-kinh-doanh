-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WEEK_PLAN_DAILY';
ALTER TYPE "NotificationType" ADD VALUE 'DEBT_WEEK_FOLLOWUP';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "zaloChatId" TEXT,
ADD COLUMN     "zaloLinkCode" TEXT,
ADD COLUMN     "zaloLinkCodeExpiresAt" TIMESTAMP(3),
ADD COLUMN     "zaloLinkedAt" TIMESTAMP(3),
ADD COLUMN     "zaloOffTypes" "NotificationType"[];

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "zaloSentAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_zaloChatId_key" ON "users"("zaloChatId");

-- CreateIndex
CREATE UNIQUE INDEX "users_zaloLinkCode_key" ON "users"("zaloLinkCode");
