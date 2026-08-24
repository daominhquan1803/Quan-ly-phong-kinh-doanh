-- CreateTable
CREATE TABLE "business_trip_supporters" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_trip_supporters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_trip_supporters_employeeId_idx" ON "business_trip_supporters"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "business_trip_supporters_tripId_employeeId_key" ON "business_trip_supporters"("tripId", "employeeId");

-- AddForeignKey
ALTER TABLE "business_trip_supporters" ADD CONSTRAINT "business_trip_supporters_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "business_trip_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_trip_supporters" ADD CONSTRAINT "business_trip_supporters_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
