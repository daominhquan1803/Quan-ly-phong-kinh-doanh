CREATE TYPE "DefectResolutionType" AS ENUM ('REPLACED', 'DESTROYED_DEDUCT_DEBT', 'OTHER');

ALTER TABLE "defect_reports" ADD COLUMN "resolutionType" "DefectResolutionType",
ADD COLUMN "deductAmount" DECIMAL(18,2);

CREATE TABLE "defect_replacements" (
    "id" TEXT NOT NULL,
    "defectReportId" TEXT NOT NULL,
    "defectReportItemId" TEXT NOT NULL,
    "shipmentSlipItemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "defect_replacements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "defect_replacements_defectReportId_idx" ON "defect_replacements"("defectReportId");
CREATE INDEX "defect_replacements_defectReportItemId_idx" ON "defect_replacements"("defectReportItemId");
CREATE INDEX "defect_replacements_shipmentSlipItemId_idx" ON "defect_replacements"("shipmentSlipItemId");

ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_defectReportId_fkey" FOREIGN KEY ("defectReportId") REFERENCES "defect_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_defectReportItemId_fkey" FOREIGN KEY ("defectReportItemId") REFERENCES "defect_report_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_shipmentSlipItemId_fkey" FOREIGN KEY ("shipmentSlipItemId") REFERENCES "shipment_slip_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "defect_replacements" ADD CONSTRAINT "defect_replacements_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
