-- Track per-user jail vote cooldown (5 min between starts).

ALTER TABLE "JailDailyUsage"
  ADD COLUMN IF NOT EXISTS "lastJailAt" TIMESTAMPTZ;
