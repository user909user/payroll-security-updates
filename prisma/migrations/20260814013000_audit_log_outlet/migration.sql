-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "outlet_id" TEXT;

-- Backfill from related entities
UPDATE "AuditLog" al
SET "outlet_id" = e."outlet_id"
FROM "Employee" e
WHERE al."entity_type" = 'Employee'
  AND al."entity_id" = e.id
  AND al."outlet_id" IS NULL;

UPDATE "AuditLog" al
SET "outlet_id" = e."outlet_id"
FROM "AttendanceRecord" ar
JOIN "Employee" e ON e.id = ar."employee_id"
WHERE al."entity_type" = 'AttendanceRecord'
  AND al."entity_id" = ar.id
  AND al."outlet_id" IS NULL;

UPDATE "AuditLog" al
SET "outlet_id" = e."outlet_id"
FROM "SalaryPayment" sp
JOIN "Employee" e ON e.id = sp."employee_id"
WHERE al."entity_type" = 'SalaryPayment'
  AND al."entity_id" = sp.id
  AND al."outlet_id" IS NULL;

UPDATE "AuditLog" al
SET "outlet_id" = e."outlet_id"
FROM "PayrollSummary" ps
JOIN "Employee" e ON e.id = ps."employee_id"
WHERE al."entity_type" = 'PayrollSummary'
  AND al."entity_id" = ps.id
  AND al."outlet_id" IS NULL;

UPDATE "AuditLog" al
SET "outlet_id" = sa."outlet_id"
FROM "SalaryAdjustment" sa
WHERE al."entity_type" = 'SalaryAdjustment'
  AND al."entity_id" = sa.id
  AND al."outlet_id" IS NULL
  AND sa."outlet_id" IS NOT NULL;

UPDATE "AuditLog" al
SET "outlet_id" = oa."outlet_id"
FROM "OvertimeRateAdjustment" oa
WHERE al."entity_type" = 'OvertimeRateAdjustment'
  AND al."entity_id" = oa.id
  AND al."outlet_id" IS NULL
  AND oa."outlet_id" IS NOT NULL;

UPDATE "AuditLog" al
SET "outlet_id" = al."entity_id"
WHERE al."entity_type" = 'Outlet'
  AND al."outlet_id" IS NULL
  AND EXISTS (SELECT 1 FROM "Outlet" o WHERE o.id = al."entity_id");

CREATE INDEX IF NOT EXISTS "AuditLog_outlet_id_timestamp_idx" ON "AuditLog"("outlet_id", "timestamp");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AuditLog_outlet_id_fkey'
  ) THEN
    ALTER TABLE "AuditLog"
      ADD CONSTRAINT "AuditLog_outlet_id_fkey"
      FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
