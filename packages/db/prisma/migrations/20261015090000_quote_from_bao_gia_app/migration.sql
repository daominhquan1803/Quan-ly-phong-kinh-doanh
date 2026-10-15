-- AlterTable
ALTER TABLE "quote_requests" ADD COLUMN     "finalResult" TEXT,
ADD COLUMN     "requestedAt" TIMESTAMP(3),
ADD COLUMN     "sourceApp" TEXT NOT NULL DEFAULT 'SHEET',
ADD COLUMN     "sourceCode" TEXT,
ADD COLUMN     "sourceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "statusRaw" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "quote_requests_sourceApp_sourceCode_key" ON "quote_requests"("sourceApp", "sourceCode");

