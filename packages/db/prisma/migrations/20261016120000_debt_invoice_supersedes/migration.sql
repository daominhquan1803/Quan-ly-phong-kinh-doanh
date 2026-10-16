-- AlterTable
ALTER TABLE "debt_invoices" ADD COLUMN     "supersedes" TEXT[] DEFAULT ARRAY[]::TEXT[];
