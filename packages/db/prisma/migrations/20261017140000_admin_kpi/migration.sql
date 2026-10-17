-- CreateEnum
CREATE TYPE "DelayReasonStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ADMIN_KPI_DAILY';
ALTER TYPE "NotificationType" ADD VALUE 'DELAY_REASON_PENDING';

-- AlterTable
ALTER TABLE "defect_reports" ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "respondedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "delivery_delay_reasons" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "status" "DelayReasonStatus" NOT NULL DEFAULT 'PENDING',
    "createdById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_delay_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_corrections" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "kind" TEXT NOT NULL,
    "refs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "statusRaw" TEXT,
    "cause" TEXT,
    "causeNote" TEXT,
    "causeSetById" TEXT,
    "causeSetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoice_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_kpi_manual" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "documentsPct" DECIMAL(5,2),
    "attitudeScore" DECIMAL(4,2),
    "note" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_kpi_manual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_satisfaction_ratings" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_satisfaction_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_delay_reasons_lineId_key" ON "delivery_delay_reasons"("lineId");

-- CreateIndex
CREATE INDEX "delivery_delay_reasons_status_idx" ON "delivery_delay_reasons"("status");

-- CreateIndex
CREATE INDEX "invoice_corrections_invoiceDate_idx" ON "invoice_corrections"("invoiceDate");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_corrections_customerCode_invoiceNumber_key" ON "invoice_corrections"("customerCode", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "admin_kpi_manual_adminId_year_month_key" ON "admin_kpi_manual"("adminId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "admin_satisfaction_ratings_adminId_raterId_year_month_key" ON "admin_satisfaction_ratings"("adminId", "raterId", "year", "month");

-- AddForeignKey
ALTER TABLE "delivery_delay_reasons" ADD CONSTRAINT "delivery_delay_reasons_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "po_tracking_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_delay_reasons" ADD CONSTRAINT "delivery_delay_reasons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_delay_reasons" ADD CONSTRAINT "delivery_delay_reasons_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_corrections" ADD CONSTRAINT "invoice_corrections_causeSetById_fkey" FOREIGN KEY ("causeSetById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_kpi_manual" ADD CONSTRAINT "admin_kpi_manual_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_kpi_manual" ADD CONSTRAINT "admin_kpi_manual_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_satisfaction_ratings" ADD CONSTRAINT "admin_satisfaction_ratings_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_satisfaction_ratings" ADD CONSTRAINT "admin_satisfaction_ratings_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

