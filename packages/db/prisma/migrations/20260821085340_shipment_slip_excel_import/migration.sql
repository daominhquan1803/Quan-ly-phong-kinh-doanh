-- AlterTable
ALTER TABLE "shipment_slips" ADD COLUMN     "importBatchId" TEXT,
ALTER COLUMN "imagePath" DROP NOT NULL;

-- CreateTable
CREATE TABLE "shipment_slip_import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorReport" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_slip_import_batches_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "shipment_slips" ADD CONSTRAINT "shipment_slips_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "shipment_slip_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_slip_import_batches" ADD CONSTRAINT "shipment_slip_import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
