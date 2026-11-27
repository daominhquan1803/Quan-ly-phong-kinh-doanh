CREATE TABLE "production_lines" (
    "id" TEXT NOT NULL,
    "lsxNo" TEXT NOT NULL,
    "poCodes" TEXT[],
    "itemCode" TEXT NOT NULL,
    "customerName" TEXT,
    "quantity" DECIMAL(14,2),
    "orderedOn" TIMESTAMP(3),
    "dueOn" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "completedOn" TIMESTAMP(3),
    "runningOn" TEXT,
    "currentStages" TEXT,
    "plannedMachine" TEXT,
    "hasProgress" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT,
    "plannedShipOn" TIMESTAMP(3),
    "plannedShipTime" TEXT,
    "hideAutoPlan" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "production_lines_itemCode_idx" ON "production_lines"("itemCode");
