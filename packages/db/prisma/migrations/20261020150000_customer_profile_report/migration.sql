-- AlterTable
ALTER TABLE "customers" ADD COLUMN "address" TEXT,
ADD COLUMN "province" TEXT,
ADD COLUMN "industry" TEXT,
ADD COLUMN "staffSize" TEXT,
ADD COLUMN "ownership" TEXT,
ADD COLUMN "contactPhone" TEXT,
ADD COLUMN "competitors" TEXT,
ADD COLUMN "potentialYear" DECIMAL(18,0),
ADD COLUMN "painPoint" TEXT,
ADD COLUMN "stage" TEXT,
ADD COLUMN "stageUpdatedAt" TIMESTAMP(3),
ADD COLUMN "profileUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_stage_history" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "changedById" TEXT,
    "source" TEXT NOT NULL DEFAULT 'APP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_stage_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "customer_stage_history_customerId_createdAt_idx" ON "customer_stage_history"("customerId", "createdAt");
ALTER TABLE "customer_stage_history" ADD CONSTRAINT "customer_stage_history_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "item_group_overrides" (
    "itemCode" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "item_group_overrides_pkey" PRIMARY KEY ("itemCode")
);

-- CreateTable
CREATE TABLE "customer_report_snapshots" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_report_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "customer_report_snapshots_year_month_key" ON "customer_report_snapshots"("year", "month");
