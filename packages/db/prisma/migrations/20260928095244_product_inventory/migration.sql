-- CreateTable
CREATE TABLE "product_inventory" (
    "id" TEXT NOT NULL,
    "itemCode" TEXT NOT NULL,
    "quantity" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "categoryName" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "product_inventory_itemCode_key" ON "product_inventory"("itemCode");
