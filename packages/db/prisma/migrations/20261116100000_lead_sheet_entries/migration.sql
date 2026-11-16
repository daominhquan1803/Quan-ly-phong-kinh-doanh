-- Khách quét báo / tự tìm / Facebook đủ 10 mục trên Google Sheet tự thành dòng "KH mới liên hệ" của Kế hoạch tuần
ALTER TABLE "week_plan_result_entries" ADD COLUMN "sheetKey" TEXT;
CREATE UNIQUE INDEX "week_plan_result_entries_sheetKey_key" ON "week_plan_result_entries"("sheetKey");
ALTER TABLE "lead_scan_items" ADD COLUMN "entryMissing" TEXT;
ALTER TABLE "lead_prospects" ADD COLUMN "entryMissing" TEXT;
