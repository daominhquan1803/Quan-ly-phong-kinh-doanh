-- AlterTable
ALTER TABLE "orders" ADD COLUMN "amisCreatedAt" TIMESTAMP(3);

-- Backfill giờ tạo đơn từ dữ liệu AMIS đã lưu
UPDATE "orders" SET "amisCreatedAt" = ("rawData"->>'created_date')::timestamptz
WHERE "rawData"->>'created_date' IS NOT NULL;

-- CreateTable
CREATE TABLE "order_confirmations" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "confirmedById" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_confirmation_photos" (
    "id" TEXT NOT NULL,
    "confirmationId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_confirmation_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_confirmations_orderId_key" ON "order_confirmations"("orderId");

-- CreateIndex
CREATE INDEX "order_confirmation_photos_confirmationId_idx" ON "order_confirmation_photos"("confirmationId");

-- AddForeignKey
ALTER TABLE "order_confirmations" ADD CONSTRAINT "order_confirmations_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_confirmations" ADD CONSTRAINT "order_confirmations_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_confirmation_photos" ADD CONSTRAINT "order_confirmation_photos_confirmationId_fkey" FOREIGN KEY ("confirmationId") REFERENCES "order_confirmations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
