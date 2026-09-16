-- AddColumn (nullable for now — backfill script fills it in before the follow-up migration makes it NOT NULL + UNIQUE)
ALTER TABLE "debt_payments" ADD COLUMN "sourceHash" TEXT;
