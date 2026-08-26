-- CreateEnum
CREATE TYPE "WeekPlanMetric" AS ENUM ('NEW_CONTACT', 'NEW_MEETING', 'EXISTING_VISIT', 'NEW_CUSTOMER_SALE', 'NEW_QUOTE', 'BUSINESS_TRIP');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "quoteAssigneeCode" TEXT;

-- CreateTable
CREATE TABLE "week_plan_targets" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "metric" "WeekPlanMetric" NOT NULL,
    "targetValue" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "week_plan_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "week_plan_result_import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorReport" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "week_plan_result_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "week_plan_result_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "metric" "WeekPlanMetric" NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT NOT NULL,
    "address" TEXT,
    "content" TEXT,
    "productInterest" TEXT,
    "importBatchId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "week_plan_result_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "week_plan_targets_weekStart_idx" ON "week_plan_targets"("weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "week_plan_targets_employeeId_weekStart_metric_key" ON "week_plan_targets"("employeeId", "weekStart", "metric");

-- CreateIndex
CREATE INDEX "week_plan_result_entries_employeeId_weekStart_metric_idx" ON "week_plan_result_entries"("employeeId", "weekStart", "metric");

-- CreateIndex
CREATE UNIQUE INDEX "users_quoteAssigneeCode_key" ON "users"("quoteAssigneeCode");

-- AddForeignKey
ALTER TABLE "week_plan_targets" ADD CONSTRAINT "week_plan_targets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_plan_targets" ADD CONSTRAINT "week_plan_targets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_plan_result_import_batches" ADD CONSTRAINT "week_plan_result_import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_plan_result_entries" ADD CONSTRAINT "week_plan_result_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_plan_result_entries" ADD CONSTRAINT "week_plan_result_entries_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "week_plan_result_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "week_plan_result_entries" ADD CONSTRAINT "week_plan_result_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

