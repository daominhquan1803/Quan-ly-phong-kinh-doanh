ALTER TYPE "NotificationType" ADD VALUE 'TRIP_ASSIGNED';

ALTER TABLE "business_trip_stops" ADD COLUMN "customerId" TEXT,
ADD COLUMN "attendeeId" TEXT,
ADD COLUMN "addedById" TEXT;

CREATE INDEX "business_trip_stops_attendeeId_idx" ON "business_trip_stops"("attendeeId");

ALTER TABLE "business_trip_stops" ADD CONSTRAINT "business_trip_stops_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_trip_stops" ADD CONSTRAINT "business_trip_stops_attendeeId_fkey" FOREIGN KEY ("attendeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "business_trip_stops" ADD CONSTRAINT "business_trip_stops_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "business_trip_stop_supporters" (
    "id" TEXT NOT NULL,
    "stopId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    CONSTRAINT "business_trip_stop_supporters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "business_trip_stop_supporters_stopId_employeeId_key" ON "business_trip_stop_supporters"("stopId", "employeeId");
CREATE INDEX "business_trip_stop_supporters_employeeId_idx" ON "business_trip_stop_supporters"("employeeId");

ALTER TABLE "business_trip_stop_supporters" ADD CONSTRAINT "business_trip_stop_supporters_stopId_fkey" FOREIGN KEY ("stopId") REFERENCES "business_trip_stops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "business_trip_stop_supporters" ADD CONSTRAINT "business_trip_stop_supporters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
