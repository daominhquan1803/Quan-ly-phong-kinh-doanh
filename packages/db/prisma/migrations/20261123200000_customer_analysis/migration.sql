-- CreateTable
CREATE TABLE "customer_analyses" (
    "id" TEXT NOT NULL,
    "companyKey" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OK',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "industry" TEXT,
    "ownership" TEXT,
    "companyType" TEXT,
    "staffSize" TEXT,
    "business" TEXT,
    "makes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "opportunities" JSONB,
    "confidence" TEXT,
    "sources" JSONB,
    "costUsd" DECIMAL(10,5),
    "analyzedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_analyses_companyKey_key" ON "customer_analyses"("companyKey");
