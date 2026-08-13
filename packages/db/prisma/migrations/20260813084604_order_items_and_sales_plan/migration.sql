-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineOrder" INTEGER NOT NULL,
    "itemCode" TEXT,
    "itemName" TEXT NOT NULL,
    "unit" TEXT,
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "warehouse" TEXT,
    "poCustomerItemCode" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_plan_import_batches" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorReport" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_plan_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_plan_lines" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "employeeNameRaw" TEXT,
    "employeeId" TEXT,
    "productCode" TEXT,
    "productName" TEXT,
    "productGroup" TEXT,
    "targetRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "targetQuantity" DECIMAL(14,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_plan_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_items_itemCode_idx" ON "order_items"("itemCode");

-- CreateIndex
CREATE INDEX "sales_plan_lines_year_month_idx" ON "sales_plan_lines"("year", "month");

-- CreateIndex
CREATE INDEX "sales_plan_lines_employeeId_idx" ON "sales_plan_lines"("employeeId");

-- CreateIndex
CREATE INDEX "sales_plan_lines_productCode_idx" ON "sales_plan_lines"("productCode");

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_plan_import_batches" ADD CONSTRAINT "sales_plan_import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_plan_lines" ADD CONSTRAINT "sales_plan_lines_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "sales_plan_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_plan_lines" ADD CONSTRAINT "sales_plan_lines_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

