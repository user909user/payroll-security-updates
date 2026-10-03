-- CreateTable
CREATE TABLE IF NOT EXISTS "PublicHoliday" (
  "id" TEXT NOT NULL,
  "outlet_id" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PublicHoliday_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PublicHoliday_outlet_id_date_key"
ON "PublicHoliday"("outlet_id", "date");

CREATE INDEX IF NOT EXISTS "PublicHoliday_outlet_id_date_idx"
ON "PublicHoliday"("outlet_id", "date");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PublicHoliday_outlet_id_fkey'
  ) THEN
    ALTER TABLE "PublicHoliday"
      ADD CONSTRAINT "PublicHoliday_outlet_id_fkey"
      FOREIGN KEY ("outlet_id") REFERENCES "Outlet"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
