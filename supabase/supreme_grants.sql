-- Add only SupremeGrants if CustomRoles already exist
CREATE TABLE IF NOT EXISTS "SupremeGrants" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'bot',
  "expiresAt" TIMESTAMPTZ,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "grantedBy" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupremeGrants_guildId_userId_key"
  ON "SupremeGrants" ("guildId", "userId");
CREATE INDEX IF NOT EXISTS "SupremeGrants_active_expiresAt_idx"
  ON "SupremeGrants" ("active", "expiresAt");
ALTER TABLE "SupremeGrants" ENABLE ROW LEVEL SECURITY;
