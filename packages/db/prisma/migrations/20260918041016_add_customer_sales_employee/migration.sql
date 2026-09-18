-- AlterTable
ALTER TABLE "customers" ADD COLUMN     "salesEmployeeId" TEXT;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_salesEmployeeId_fkey" FOREIGN KEY ("salesEmployeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
