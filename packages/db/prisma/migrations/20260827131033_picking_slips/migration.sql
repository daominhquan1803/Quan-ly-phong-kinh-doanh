-- AlterTable
ALTER TABLE "users" ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "picking_slips" (
    "id" TEXT NOT NULL,
    "slipNumber" TEXT NOT NULL,
    "slipDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customerCode" TEXT,
    "customerName" TEXT NOT NULL,
    "deliveryAddress" TEXT,
    "contactPhone" TEXT,
    "salesEmployeeId" TEXT,
    "salesEmployeeNameSnapshot" TEXT,
    "salesEmployeePhoneSnapshot" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "picking_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picking_slip_items" (
    "id" TEXT NOT NULL,
    "pickingSlipId" TEXT NOT NULL,
    "lineOrder" INTEGER NOT NULL,
    "poTrackingLineId" TEXT,
    "poCode" TEXT NOT NULL,
    "itemCode" TEXT,
    "itemName" TEXT NOT NULL,
    "customerItemCode" TEXT,
    "unit" TEXT,
    "poQuantitySnapshot" DECIMAL(14,2),
    "remainingQtySnapshot" DECIMAL(14,2),
    "poDateSnapshot" TIMESTAMP(3),
    "qtyToPick" DECIMAL(14,2) NOT NULL,
    "deliveryDate" TIMESTAMP(3),

    CONSTRAINT "picking_slip_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "picking_slips_slipNumber_key" ON "picking_slips"("slipNumber");

-- CreateIndex
CREATE INDEX "picking_slips_customerCode_idx" ON "picking_slips"("customerCode");

-- CreateIndex
CREATE INDEX "picking_slip_items_pickingSlipId_idx" ON "picking_slip_items"("pickingSlipId");

-- AddForeignKey
ALTER TABLE "picking_slips" ADD CONSTRAINT "picking_slips_salesEmployeeId_fkey" FOREIGN KEY ("salesEmployeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_slips" ADD CONSTRAINT "picking_slips_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picking_slip_items" ADD CONSTRAINT "picking_slip_items_pickingSlipId_fkey" FOREIGN KEY ("pickingSlipId") REFERENCES "picking_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

