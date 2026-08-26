-- AlterTable
ALTER TABLE "kpi_monthly_entries" DROP COLUMN "actualHighPriceSkuCount",
DROP COLUMN "attendanceDays",
DROP COLUMN "targetHighPriceSkuCount",
ADD COLUMN     "weightNewCustomers" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "weightRevenue" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "weightRevenueSX" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "weightVisit" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "week_plan_targets" ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 0;

