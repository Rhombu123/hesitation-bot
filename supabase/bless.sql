-- Bless XP boosts: variable multiplier + daily charge tracking.
-- Extends XpBoosters; adds DailyBlessGiven.

ALTER TABLE "XpBoosters"
  ADD COLUMN IF NOT EXISTS "multiplier" INTEGER NOT NULL DEFAULT 2;

ALTER TABLE "XpBoosters"
  ADD COLUMN IF NOT EXISTS "blessActive" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS "DailyBlessGiven" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyBlessGiven_guild_user_date_key"
  ON "DailyBlessGiven" ("guildId", "userId", "date");
ALTER TABLE "DailyBlessGiven" ENABLE ROW LEVEL SECURITY;
