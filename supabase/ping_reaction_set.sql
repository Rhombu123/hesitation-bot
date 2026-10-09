-- Ping reaction presets (`.set`) — Supreme / Mythic only

CREATE TABLE IF NOT EXISTS "PingReactionSet" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emojis" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "PingReactionSet_guild_user_key"
  ON "PingReactionSet" ("guildId", "userId");
