-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_RISK';
ALTER TYPE "NotificationType" ADD VALUE 'SEASON_REMINDER';

-- CreateEnum
CREATE TYPE "CustomerBuyingPattern" AS ENUM ('REGULAR', 'SEASONAL', 'PROJECT');
CREATE TYPE "CareChannel" AS ENUM ('CALL', 'ZALO', 'MEET');
CREATE TYPE "CareOutcome" AS ENUM ('NORMAL', 'UPCOMING_ORDER', 'NEW_NEED', 'ISSUE', 'NO_CONTACT', 'LOST');

-- AlterTable
ALTER TABLE "customers" ADD COLUMN "buyingPattern" "CustomerBuyingPattern" NOT NULL DEFAULT 'REGULAR',
ADD COLUMN "seasonMonths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN "seasonLeadMonths" INTEGER NOT NULL DEFAULT 2;

-- CreateTable
CREATE TABLE "customer_care_logs" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "channel" "CareChannel" NOT NULL,
    "outcome" "CareOutcome" NOT NULL,
    "note" TEXT,
    "issueType" TEXT,
    "expectedMonth" INTEGER,
    "needGroup" TEXT,
    "needValueBand" TEXT,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_care_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_care_logs_customerId_createdAt_idx" ON "customer_care_logs"("customerId", "createdAt");
CREATE INDEX "customer_care_logs_employeeId_createdAt_idx" ON "customer_care_logs"("employeeId", "createdAt");
CREATE INDEX "customer_care_logs_followUpAt_idx" ON "customer_care_logs"("followUpAt");

-- AddForeignKey
ALTER TABLE "customer_care_logs" ADD CONSTRAINT "customer_care_logs_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_care_logs" ADD CONSTRAINT "customer_care_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
