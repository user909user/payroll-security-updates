-- AlterTable
ALTER TABLE "SalaryAdjustment" ADD COLUMN IF NOT EXISTS "outlet_id" TEXT;

-- Backfill outlet from first employee in snapshot (when possible)
UPDATE "SalaryAdjustment" sa
SET "outlet_id" = e."outlet_id"
FROM (
  SELECT
    sa2.id AS adj_id,
    (sa2.snapshot::json->0->>'id') AS employee_id
  FROM "SalaryAdjustment" sa2
  WHERE sa2."outlet_id" IS NULL
    AND sa2.snapshot IS NOT NULL
    AND sa2.snapshot <> ''
) parsed
JOIN "Employee" e ON e.id = parsed.employee_id
WHERE sa.id = parsed.adj_id
  AND sa."outlet_id" IS NULL;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SalaryAdjustment_outlet_id_created_at_idx" ON "SalaryAdjustment"("outlet_id", "created_at");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'SalaryAdjustment_outlet_id_fkey'
  ) THEN
    ALTER TABLE "SalaryAdjustment"
      ADD CONSTRAINT "SalaryAdjustment_outlet_id_fkey"
      FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- OvertimeRateAdjustment outlet index (column already exists)
CREATE INDEX IF NOT EXISTS "OvertimeRateAdjustment_outlet_id_created_at_idx" ON "OvertimeRateAdjustment"("outlet_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OvertimeRateAdjustment_outlet_id_fkey'
  ) THEN
    ALTER TABLE "OvertimeRateAdjustment"
      ADD CONSTRAINT "OvertimeRateAdjustment_outlet_id_fkey"
      FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
