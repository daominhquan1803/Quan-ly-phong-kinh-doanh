-- Thành tiền báo giá chép từ app báo giá (Σ số lượng × đơn giá L1/L2)
ALTER TABLE "quote_requests" ADD COLUMN "amountL1" DECIMAL(18,2);
ALTER TABLE "quote_requests" ADD COLUMN "amountL2" DECIMAL(18,2);
