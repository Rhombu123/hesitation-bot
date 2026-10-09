-- Persist weekly Genius / Popular / Collector / Ruler winners so roles survive
-- bot restarts after find-inventory cleanup.

CREATE TABLE IF NOT EXISTS "WeeklyCrownAward" (
  "guildId" TEXT PRIMARY KEY,
  "awardedWeekId" TEXT NOT NULL,
  "geniusId" TEXT,
  "popularId" TEXT,
  "collectorId" TEXT,
  "rulerId" TEXT,
  "awardedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "WeeklyCrownAward_awardedWeekId_idx"
  ON "WeeklyCrownAward" ("awardedWeekId");

-- Snapshot find leaderboard #1 before weekly inventory wipe (collector fallback).
CREATE TABLE IF NOT EXISTS "FindWeeklyWinner" (
  "guildId" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "savedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY ("guildId", "weekId")
);
