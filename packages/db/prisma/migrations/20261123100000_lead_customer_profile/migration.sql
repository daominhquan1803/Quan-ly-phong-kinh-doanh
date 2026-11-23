-- Khách tiềm năng từ Google Sheet vào hồ sơ khách hàng + lịch sử chăm sóc (chỉ thêm cột, không đụng dữ liệu cũ).
ALTER TABLE "customers" ADD COLUMN "source" TEXT;
ALTER TABLE "customers" ADD COLUMN "leadKey" TEXT;
CREATE UNIQUE INDEX "customers_leadKey_key" ON "customers"("leadKey");

ALTER TABLE "customer_care_logs" ADD COLUMN "sheetKey" TEXT;
CREATE UNIQUE INDEX "customer_care_logs_sheetKey_key" ON "customer_care_logs"("sheetKey");
