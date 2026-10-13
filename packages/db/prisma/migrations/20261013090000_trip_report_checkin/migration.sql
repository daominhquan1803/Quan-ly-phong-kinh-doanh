-- CreateEnum
CREATE TYPE "TripStopOutcome" AS ENUM ('MET', 'NOT_MET', 'RESCHEDULED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TripStatus" ADD VALUE 'REPORTED';
ALTER TYPE "TripStatus" ADD VALUE 'NEEDS_REVISION';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'TRIP_REPORT_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'TRIP_NEXT_STEP_DUE';
ALTER TYPE "NotificationType" ADD VALUE 'TRIP_REVIEW_PENDING';
ALTER TYPE "NotificationType" ADD VALUE 'TRIP_REVIEWED';

-- AlterTable
ALTER TABLE "business_trip_requests" ADD COLUMN     "reportedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "business_trip_stops" ADD COLUMN     "checkinAccuracyM" INTEGER,
ADD COLUMN     "checkinAt" TIMESTAMP(3),
ADD COLUMN     "checkinLat" DECIMAL(9,6),
ADD COLUMN     "checkinLng" DECIMAL(9,6),
ADD COLUMN     "contactName" TEXT,
ADD COLUMN     "contactPhone" TEXT,
ADD COLUMN     "nextAction" TEXT,
ADD COLUMN     "nextActionDoneAt" TIMESTAMP(3),
ADD COLUMN     "nextActionDue" TIMESTAMP(3),
ADD COLUMN     "nextActionOwnerId" TEXT,
ADD COLUMN     "outcome" "TripStopOutcome",
ADD COLUMN     "productInterest" TEXT,
ADD COLUMN     "reportContent" TEXT;

-- CreateTable
CREATE TABLE "business_trip_photos" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_trip_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_trip_photos_stopId_idx" ON "business_trip_photos"("stopId");

-- CreateIndex
CREATE INDEX "business_trip_stops_nextActionOwnerId_nextActionDue_idx" ON "business_trip_stops"("nextActionOwnerId", "nextActionDue");

-- AddForeignKey
ALTER TABLE "business_trip_stops" ADD CONSTRAINT "business_trip_stops_nextActionOwnerId_fkey" FOREIGN KEY ("nextActionOwnerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_trip_photos" ADD CONSTRAINT "business_trip_photos_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "business_trip_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

