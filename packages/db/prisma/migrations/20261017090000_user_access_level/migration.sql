-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('FULL', 'OPERATOR', 'VIEWER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "accessLevel" "AccessLevel" NOT NULL DEFAULT 'FULL';
