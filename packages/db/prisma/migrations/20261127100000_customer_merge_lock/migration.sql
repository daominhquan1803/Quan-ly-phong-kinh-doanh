-- Khách trùng: khoá tạm và gộp hồ sơ (không xoá dữ liệu).
ALTER TABLE "customers" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "customers" ADD COLUMN "mergedIntoId" TEXT;
CREATE INDEX "customers_mergedIntoId_idx" ON "customers"("mergedIntoId");
ALTER TABLE "customers" ADD CONSTRAINT "customers_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
