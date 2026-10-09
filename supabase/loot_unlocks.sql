-- User unlocks for ultra-rare game loot roles (!loot).

CREATE TABLE IF NOT EXISTS "UserLootUnlocks" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lootId" TEXT NOT NULL,
  "unlockedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserLootUnlocks_guild_user_loot_key"
  ON "UserLootUnlocks" ("guildId", "userId", "lootId");

CREATE INDEX IF NOT EXISTS "UserLootUnlocks_guild_user_idx"
  ON "UserLootUnlocks" ("guildId", "userId");

ALTER TABLE "UserLootUnlocks" ENABLE ROW LEVEL SECURITY;
