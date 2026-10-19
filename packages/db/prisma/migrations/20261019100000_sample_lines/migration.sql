-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "po_tracking_lines" ADD COLUMN "isSample" BOOLEAN NOT NULL DEFAULT false;
