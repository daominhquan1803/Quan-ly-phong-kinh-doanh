-- Chỉ chạy migration này SAU KHI đã backfill sourceHash cho toàn bộ bản ghi hiện có và gộp xong
-- các bản ghi trùng lặp (xem packages/db/scripts/backfill-payment-source-hash.js) — nếu không sẽ
-- lỗi vì còn giá trị NULL hoặc trùng nhau vi phạm UNIQUE.
ALTER TABLE "debt_payments" ALTER COLUMN "sourceHash" SET NOT NULL;
CREATE UNIQUE INDEX "debt_payments_sourceHash_key" ON "debt_payments"("sourceHash");
