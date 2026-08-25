-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('NOT_QUOTED', 'NEGOTIATING', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "quote_requests" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "requestDay" INTEGER,
    "assigneeRaw" TEXT,
    "customerField" TEXT,
    "customerType" TEXT,
    "customerName" TEXT NOT NULL,
    "productInterest" TEXT,
    "companyNationality" TEXT,
    "scale" TEXT,
    "quantity" TEXT,
    "unit" TEXT,
    "potentialItems" TEXT,
    "deliveryAddress" TEXT,
    "pricingStaff" TEXT,
    "quoteL1" TEXT,
    "feedbackL1" TEXT,
    "quoteL2" TEXT,
    "feedbackL2" TEXT,
    "note" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'NOT_QUOTED',
    "sourceColorHex" TEXT,
    "sourceSheetName" TEXT NOT NULL,
    "sourceRowNumber" INTEGER NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quote_requests_year_month_idx" ON "quote_requests"("year", "month");

-- CreateIndex
CREATE INDEX "quote_requests_status_idx" ON "quote_requests"("status");

-- CreateIndex
CREATE INDEX "quote_requests_assigneeRaw_idx" ON "quote_requests"("assigneeRaw");
