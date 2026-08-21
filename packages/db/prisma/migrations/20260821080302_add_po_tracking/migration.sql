-- CreateTable
CREATE TABLE "po_tracking_import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorReport" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "po_tracking_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_tracking_lines" (
    "id" TEXT NOT NULL,
    "naturalKey" TEXT NOT NULL,
    "nvkdCodeRaw" TEXT,
    "salesEmployeeId" TEXT,
    "customerCode" TEXT,
    "poMonthLabel" TEXT,
    "poCode" TEXT NOT NULL,
    "itemCode" TEXT,
    "itemName" TEXT,
    "invoiceName" TEXT,
    "customerItemCode" TEXT,
    "monthLabel" TEXT,
    "poDate" TIMESTAMP(3),
    "poQuantity" DECIMAL(14,2),
    "unit" TEXT,
    "actualPrice" DECIMAL(18,2),
    "contractPrice" DECIMAL(18,2),
    "requestedDeliveryDate" TIMESTAMP(3),
    "note" TEXT,
    "statusRaw" TEXT,
    "totalDeliveredQty" DECIMAL(14,2),
    "remainingQty" DECIMAL(14,2),
    "poValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deliveredValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remainingValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "content" TEXT,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "po_tracking_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "po_delivery_events" (
    "id" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "salesEmployeeId" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL,
    "value" DECIMAL(18,2) NOT NULL,
    "sequence" INTEGER NOT NULL,

    CONSTRAINT "po_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "po_tracking_lines_naturalKey_key" ON "po_tracking_lines"("naturalKey");

-- CreateIndex
CREATE INDEX "po_tracking_lines_salesEmployeeId_idx" ON "po_tracking_lines"("salesEmployeeId");

-- CreateIndex
CREATE INDEX "po_tracking_lines_poDate_idx" ON "po_tracking_lines"("poDate");

-- CreateIndex
CREATE INDEX "po_tracking_lines_poCode_idx" ON "po_tracking_lines"("poCode");

-- CreateIndex
CREATE INDEX "po_delivery_events_eventDate_idx" ON "po_delivery_events"("eventDate");

-- CreateIndex
CREATE INDEX "po_delivery_events_salesEmployeeId_eventDate_idx" ON "po_delivery_events"("salesEmployeeId", "eventDate");

-- AddForeignKey
ALTER TABLE "po_tracking_import_batches" ADD CONSTRAINT "po_tracking_import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_tracking_lines" ADD CONSTRAINT "po_tracking_lines_salesEmployeeId_fkey" FOREIGN KEY ("salesEmployeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_tracking_lines" ADD CONSTRAINT "po_tracking_lines_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "po_tracking_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "po_delivery_events" ADD CONSTRAINT "po_delivery_events_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "po_tracking_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
