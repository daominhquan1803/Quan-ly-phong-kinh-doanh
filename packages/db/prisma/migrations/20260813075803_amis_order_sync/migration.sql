-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "amisOrderId" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "sync_logs" ADD COLUMN     "cursor" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "amisEmployeeCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_amisOrderId_key" ON "orders"("amisOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "users_amisEmployeeCode_key" ON "users"("amisEmployeeCode");

