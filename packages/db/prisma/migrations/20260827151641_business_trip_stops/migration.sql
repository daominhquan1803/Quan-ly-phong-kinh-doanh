-- CreateTable
CREATE TABLE "business_trip_stops" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "companyName" TEXT NOT NULL,
    "address" TEXT,
    "expectedTime" TEXT,
    "content" TEXT NOT NULL,

    CONSTRAINT "business_trip_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_trip_stops_tripId_idx" ON "business_trip_stops"("tripId");

-- AddForeignKey
ALTER TABLE "business_trip_stops" ADD CONSTRAINT "business_trip_stops_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "business_trip_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DataMigration: chuyển companyName/content/expectedTime của mỗi BusinessTripRequest đã có sẵn
-- thành đúng 1 dòng BusinessTripStop (orderIndex=1) trước khi xoá các cột cũ khỏi bảng gốc —
-- không mất dữ liệu lịch sử các buổi đi công tác đã đăng ký/duyệt trước đây.
INSERT INTO "business_trip_stops" ("id", "tripId", "orderIndex", "companyName", "address", "expectedTime", "content")
SELECT gen_random_uuid()::text, "id", 1, "companyName", NULL, "expectedTime", "content"
FROM "business_trip_requests";

-- AlterTable
ALTER TABLE "business_trip_requests" DROP COLUMN "companyName",
DROP COLUMN "content",
DROP COLUMN "expectedTime";
