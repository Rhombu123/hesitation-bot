-- Bump reminder schedule — survives bot restarts/redeploys.
-- Run in Supabase SQL Editor (safe to re-run).

CREATE TABLE IF NOT EXISTS "BumpReminderState" (
  "guildId" TEXT PRIMARY KEY,
  "nextReminderAt" TIMESTAMPTZ NOT NULL,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "BumpReminderState_nextReminderAt_idx"
  ON "BumpReminderState" ("nextReminderAt");
