-- DropTable
DROP TABLE "debt_snapshots";

-- CreateTable
CREATE TABLE "debt_invoices" (
    "id" TEXT NOT NULL,
    "customerCode" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "salesEmployeeId" TEXT,
    "expectedPaymentDate" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'BASELINE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3),
    "customerCode" TEXT,
    "customerName" TEXT,
    "rawDescription" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "matchStatus" TEXT NOT NULL DEFAULT 'UNMATCHED',
    "importBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payment_allocations" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "matchMethod" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_import_batches" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "createdCount" INTEGER NOT NULL,
    "updatedCount" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "errorReport" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "debt_import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "debt_invoices_customerCode_idx" ON "debt_invoices"("customerCode");

-- CreateIndex
CREATE INDEX "debt_invoices_salesEmployeeId_idx" ON "debt_invoices"("salesEmployeeId");

-- CreateIndex
CREATE INDEX "debt_invoices_dueDate_idx" ON "debt_invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "debt_invoices_customerCode_invoiceNumber_key" ON "debt_invoices"("customerCode", "invoiceNumber");

-- CreateIndex
CREATE INDEX "debt_payments_customerCode_idx" ON "debt_payments"("customerCode");

-- CreateIndex
CREATE INDEX "debt_payments_importBatchId_idx" ON "debt_payments"("importBatchId");

-- CreateIndex
CREATE INDEX "debt_payment_allocations_paymentId_idx" ON "debt_payment_allocations"("paymentId");

-- CreateIndex
CREATE INDEX "debt_payment_allocations_invoiceId_idx" ON "debt_payment_allocations"("invoiceId");

-- AddForeignKey
ALTER TABLE "debt_invoices" ADD CONSTRAINT "debt_invoices_salesEmployeeId_fkey" FOREIGN KEY ("salesEmployeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "debt_import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "debt_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payment_allocations" ADD CONSTRAINT "debt_payment_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "debt_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_import_batches" ADD CONSTRAINT "debt_import_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

