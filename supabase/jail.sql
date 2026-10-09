-- Jail system (!jail / !bail / !immunity) — run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "JailDailyUsage" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "jailsStarted" INTEGER NOT NULL DEFAULT 0,
  "bailsUsed" INTEGER NOT NULL DEFAULT 0,
  "lastJailAt" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS "JailDailyUsage_guild_user_date_key"
  ON "JailDailyUsage" ("guildId", "userId", "date");

CREATE TABLE IF NOT EXISTS "JailEscapeWeekly" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "escapesUsed" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "JailEscapeWeekly_guild_user_week_key"
  ON "JailEscapeWeekly" ("guildId", "userId", "weekId");

CREATE TABLE IF NOT EXISTS "JailImmunity" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weeklyTokens" INTEGER NOT NULL DEFAULT 0,
  "monthlyTokens" INTEGER NOT NULL DEFAULT 0,
  "activeUntil" TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS "JailImmunity_guild_user_key"
  ON "JailImmunity" ("guildId", "userId");

CREATE TABLE IF NOT EXISTS "JailRecord" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "startedByUserId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "JailRecord_guild_user_idx"
  ON "JailRecord" ("guildId", "userId");
CREATE INDEX IF NOT EXISTS "JailRecord_guild_expires_idx"
  ON "JailRecord" ("guildId", "expiresAt");
