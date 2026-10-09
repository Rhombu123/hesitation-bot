-- Supreme custom-role boosts (!boost) — run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS "DailyBoostGiven" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyBoostGiven_guild_user_date_key"
  ON "DailyBoostGiven" ("guildId", "userId", "date");

CREATE TABLE IF NOT EXISTS "RoleBoost" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toOwnerId" TEXT NOT NULL,
  "discordRoleId" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "RoleBoost_guild_week_role_idx"
  ON "RoleBoost" ("guildId", "weekId", "discordRoleId");
CREATE INDEX IF NOT EXISTS "RoleBoost_guild_week_owner_idx"
  ON "RoleBoost" ("guildId", "weekId", "toOwnerId");
