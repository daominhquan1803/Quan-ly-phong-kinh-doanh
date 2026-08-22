/*
  Warnings:

  - You are about to drop the column `actualProfitPct` on the `kpi_monthly_entries` table. All the data in the column will be lost.
  - You are about to drop the column `targetProfitPct` on the `kpi_monthly_entries` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "kpi_monthly_entries" DROP COLUMN "actualProfitPct",
DROP COLUMN "targetProfitPct",
ADD COLUMN     "actualHighPriceSkuCount" INTEGER,
ADD COLUMN     "targetHighPriceSkuCount" INTEGER;
