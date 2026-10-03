-- AlterTable
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "overtime_rate" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill from outlet OT rates so existing employees keep current pay
UPDATE "Employee" e
SET "overtime_rate" = o."overtime_rate"
FROM "Outlet" o
WHERE e."outlet_id" = o."id"
  AND (e."overtime_rate" IS NULL OR e."overtime_rate" = 0)
  AND o."overtime_rate" > 0;
