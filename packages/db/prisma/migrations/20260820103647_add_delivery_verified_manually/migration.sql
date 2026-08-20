-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryVerifiedManually" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deliveryVerifiedNote" TEXT;
