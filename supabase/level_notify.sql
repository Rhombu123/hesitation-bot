-- Level-up notification preferences (server channel + DM).
-- Default when no row: both enabled.

CREATE TABLE IF NOT EXISTS "LevelNotifyPrefs" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "serverEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "dmEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "LevelNotifyPrefs_guildId_userId_key"
  ON "LevelNotifyPrefs" ("guildId", "userId");

ALTER TABLE "LevelNotifyPrefs" ENABLE ROW LEVEL SECURITY;
