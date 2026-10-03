-- AlterTable
ALTER TABLE "PayrollSummary"
ADD COLUMN IF NOT EXISTS "extra_allowance" DECIMAL(10,2) NOT NULL DEFAULT 0;
