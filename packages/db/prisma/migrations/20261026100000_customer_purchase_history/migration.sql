-- CreateTable
CREATE TABLE "customer_purchase_history" (
    "accountName" TEXT NOT NULL,
    "accountCode" TEXT,
    "lastOrderAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_purchase_history_pkey" PRIMARY KEY ("accountName")
);
