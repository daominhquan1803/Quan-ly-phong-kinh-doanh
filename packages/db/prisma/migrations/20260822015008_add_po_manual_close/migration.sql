-- AlterTable
ALTER TABLE "po_tracking_lines" ADD COLUMN     "manuallyClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manuallyClosedAt" TIMESTAMP(3),
ADD COLUMN     "manuallyClosedByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "po_tracking_lines" ADD CONSTRAINT "po_tracking_lines_manuallyClosedByUserId_fkey" FOREIGN KEY ("manuallyClosedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
