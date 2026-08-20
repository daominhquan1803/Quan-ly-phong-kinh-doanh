-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "business_trip_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "expectedTime" TEXT,
    "companyName" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "TripStatus" NOT NULL DEFAULT 'PENDING',
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_trip_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "defect_reports" (
    "id" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defect_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_monthly_entries" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "targetProfitPct" DECIMAL(6,2),
    "actualProfitPct" DECIMAL(6,2),
    "targetNewCustomers" INTEGER,
    "actualNewCustomers" INTEGER,
    "debtOverduePct" DECIMAL(6,2),
    "debtCollectionRatePct" DECIMAL(6,2),
    "visitTarget" INTEGER NOT NULL DEFAULT 8,
    "attendanceDays" DECIMAL(5,2),
    "violationCount" INTEGER DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_monthly_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_trip_requests_employeeId_idx" ON "business_trip_requests"("employeeId");

-- CreateIndex
CREATE INDEX "business_trip_requests_visitDate_idx" ON "business_trip_requests"("visitDate");

-- CreateIndex
CREATE INDEX "business_trip_requests_status_idx" ON "business_trip_requests"("status");

-- CreateIndex
CREATE INDEX "defect_reports_employeeId_idx" ON "defect_reports"("employeeId");

-- CreateIndex
CREATE INDEX "defect_reports_reportDate_idx" ON "defect_reports"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "kpi_monthly_entries_employeeId_year_month_key" ON "kpi_monthly_entries"("employeeId", "year", "month");

-- AddForeignKey
ALTER TABLE "business_trip_requests" ADD CONSTRAINT "business_trip_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "business_trip_requests" ADD CONSTRAINT "business_trip_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reports" ADD CONSTRAINT "defect_reports_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defect_reports" ADD CONSTRAINT "defect_reports_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_monthly_entries" ADD CONSTRAINT "kpi_monthly_entries_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_monthly_entries" ADD CONSTRAINT "kpi_monthly_entries_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
