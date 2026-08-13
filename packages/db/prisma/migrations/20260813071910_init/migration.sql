-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SALES');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('NEW', 'CONFIRMED', 'PRODUCING', 'PARTIAL_DELIVERED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlipStatus" AS ENUM ('DRAFT', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'SALES',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_aliases" (
    "id" TEXT NOT NULL,
    "aliasName" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,

    CONSTRAINT "employee_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'AMIS_ORDER',
    "headerHash" TEXT NOT NULL,
    "columnMapping" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" TEXT NOT NULL,
    "templateId" TEXT,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorReport" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "orderCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerCode" TEXT,
    "salesEmployeeNameRaw" TEXT,
    "salesEmployeeId" TEXT,
    "orderDate" TIMESTAMP(3),
    "expectedDeliveryDate" TIMESTAMP(3),
    "status" "OrderStatus" NOT NULL DEFAULT 'NEW',
    "totalValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "poCode" TEXT,
    "rawData" JSONB,
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_slips" (
    "id" TEXT NOT NULL,
    "slipNumber" TEXT NOT NULL,
    "slipDate" TIMESTAMP(3),
    "receiverName" TEXT,
    "customerName" TEXT,
    "deliveryAddress" TEXT,
    "description" TEXT,
    "paymentMethod" TEXT,
    "preparedBy" TEXT,
    "imagePath" TEXT NOT NULL,
    "imageThumbPath" TEXT,
    "orderId" TEXT,
    "ocrRawResponse" JSONB,
    "ocrConfidenceNote" JSONB,
    "status" "SlipStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipment_slips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_slip_items" (
    "id" TEXT NOT NULL,
    "shipmentSlipId" TEXT NOT NULL,
    "lineOrder" INTEGER NOT NULL,
    "itemCode" TEXT,
    "itemName" TEXT NOT NULL,
    "warehouse" TEXT,
    "poSaleNumber" TEXT,
    "unit" TEXT,
    "qtyRequested" DECIMAL(14,2),
    "qtyActual" DECIMAL(14,2),
    "poCustomerItemCode" TEXT,
    "note" TEXT,

    CONSTRAINT "shipment_slip_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_snapshots" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerCode" TEXT,
    "salesEmployeeId" TEXT,
    "totalDebt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overdueDebt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "agingBuckets" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'HIENVI',
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "SyncStatus" NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "message" TEXT,
    "recordsSynced" INTEGER,
    "triggeredBy" TEXT,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_targets" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "targetRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "employee_aliases_aliasName_key" ON "employee_aliases"("aliasName");

-- CreateIndex
CREATE UNIQUE INDEX "import_templates_headerHash_key" ON "import_templates"("headerHash");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderCode_key" ON "orders"("orderCode");

-- CreateIndex
CREATE INDEX "orders_salesEmployeeId_idx" ON "orders"("salesEmployeeId");

-- CreateIndex
CREATE INDEX "orders_expectedDeliveryDate_idx" ON "orders"("expectedDeliveryDate");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "shipment_slips_slipNumber_key" ON "shipment_slips"("slipNumber");

-- CreateIndex
CREATE INDEX "shipment_slips_orderId_idx" ON "shipment_slips"("orderId");

-- CreateIndex
CREATE INDEX "shipment_slips_slipDate_idx" ON "shipment_slips"("slipDate");

-- CreateIndex
CREATE INDEX "debt_snapshots_snapshotDate_idx" ON "debt_snapshots"("snapshotDate");

-- CreateIndex
CREATE INDEX "debt_snapshots_customerName_idx" ON "debt_snapshots"("customerName");

-- CreateIndex
CREATE INDEX "sync_logs_jobType_startedAt_idx" ON "sync_logs"("jobType", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sales_targets_employeeId_year_month_key" ON "sales_targets"("employeeId", "year", "month");

-- AddForeignKey
ALTER TABLE "employee_aliases" ADD CONSTRAINT "employee_aliases_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_templates" ADD CONSTRAINT "import_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "import_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_salesEmployeeId_fkey" FOREIGN KEY ("salesEmployeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_slips" ADD CONSTRAINT "shipment_slips_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_slips" ADD CONSTRAINT "shipment_slips_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_slip_items" ADD CONSTRAINT "shipment_slip_items_shipmentSlipId_fkey" FOREIGN KEY ("shipmentSlipId") REFERENCES "shipment_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_targets" ADD CONSTRAINT "sales_targets_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
