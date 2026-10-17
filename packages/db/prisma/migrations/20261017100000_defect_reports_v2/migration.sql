-- CreateEnum
CREATE TYPE "DefectStatus" AS ENUM ('OPEN', 'CLOSED');

-- DropForeignKey
ALTER TABLE "defect_reports" DROP CONSTRAINT "defect_reports_employeeId_fkey";

-- AlterTable
ALTER TABLE "defect_reports" ADD COLUMN     "adjustedInvoiceNumbers" TEXT,
ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "customerCode" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "deliveryDate" TIMESTAMP(3),
ADD COLUMN     "invoiceAdjustNote" TEXT,
ADD COLUMN     "invoiceAdjusted" BOOLEAN,
ADD COLUMN     "otherResponsible" TEXT,
ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "shipmentSlipId" TEXT,
ADD COLUMN     "status" "DefectStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "employeeId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "defect_report_items" (
    "id" TEXT NOT NULL,
    "defectReportId" TEXT NOT NULL,
    "slipItemId" TEXT,
    "itemCode" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT,
    "deliveredQty" DECIMAL(14,2),
    "defectQty" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "defect_report_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_responsibles" (
    "id" TEXT NOT NULL,
    "defectReportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "defect_responsibles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_photos" (
    "id" TEXT NOT NULL,
    "defectReportId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "defect_report_items_defectReportId_idx" ON "defect_report_items"("defectReportId");

-- CreateIndex
CREATE INDEX "defect_responsibles_userId_idx" ON "defect_responsibles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "defect_responsibles_defectReportId_userId_key" ON "defect_responsibles"("defectReportId", "userId");

-- CreateIndex
CREATE INDEX "defect_photos_defectReportId_idx" ON "defect_photos"("defectReportId");

-- CreateIndex
CREATE INDEX "defect_reports_status_idx" ON "defect_reports"("status");

-- AddForeignKey
ALTER TABLE "defect_reports" ADD CONSTRAINT "defect_reports_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reports" ADD CONSTRAINT "defect_reports_shipmentSlipId_fkey" FOREIGN KEY ("shipmentSlipId") REFERENCES "shipment_slips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reports" ADD CONSTRAINT "defect_reports_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_report_items" ADD CONSTRAINT "defect_report_items_defectReportId_fkey" FOREIGN KEY ("defectReportId") REFERENCES "defect_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_responsibles" ADD CONSTRAINT "defect_responsibles_defectReportId_fkey" FOREIGN KEY ("defectReportId") REFERENCES "defect_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_responsibles" ADD CONSTRAINT "defect_responsibles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_photos" ADD CONSTRAINT "defect_photos_defectReportId_fkey" FOREIGN KEY ("defectReportId") REFERENCES "defect_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Biên bản cũ: chuyển NVKD chịu trách nhiệm sang bảng người chịu trách nhiệm mới.
INSERT INTO "defect_responsibles" ("id", "defectReportId", "userId")
SELECT 'dr_' || "id", "id", "employeeId" FROM "defect_reports" WHERE "employeeId" IS NOT NULL;
