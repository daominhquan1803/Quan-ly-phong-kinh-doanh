-- AlterTable
ALTER TABLE "po_delivery_events" ADD COLUMN     "sourceShipmentSlipId" TEXT;

-- AlterTable
ALTER TABLE "po_tracking_lines" ADD COLUMN     "baselineClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "baselineDeliveredQty" DECIMAL(14,2),
ADD COLUMN     "baselineDeliveredValue" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "po_delivery_events_sourceShipmentSlipId_idx" ON "po_delivery_events"("sourceShipmentSlipId");

-- AddForeignKey
ALTER TABLE "po_delivery_events" ADD CONSTRAINT "po_delivery_events_sourceShipmentSlipId_fkey" FOREIGN KEY ("sourceShipmentSlipId") REFERENCES "shipment_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
