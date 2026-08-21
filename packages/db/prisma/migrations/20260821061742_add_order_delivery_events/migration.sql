-- CreateTable
CREATE TABLE "order_delivery_events" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "salesEmployeeId" TEXT,
    "deltaValue" DECIMAL(18,2) NOT NULL,
    "deliveredValueAfter" DECIMAL(18,2) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_delivery_events_occurredAt_idx" ON "order_delivery_events"("occurredAt");

-- CreateIndex
CREATE INDEX "order_delivery_events_salesEmployeeId_occurredAt_idx" ON "order_delivery_events"("salesEmployeeId", "occurredAt");

-- AddForeignKey
ALTER TABLE "order_delivery_events" ADD CONSTRAINT "order_delivery_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
