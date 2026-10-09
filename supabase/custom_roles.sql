-- Supreme grants + custom roles (run in Supabase SQL Editor)
CREATE TABLE IF NOT EXISTS "CustomRoles" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "discordRoleId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomRoles_guildId_ownerId_key"
  ON "CustomRoles" ("guildId", "ownerId");
CREATE UNIQUE INDEX IF NOT EXISTS "CustomRoles_guildId_discordRoleId_key"
  ON "CustomRoles" ("guildId", "discordRoleId");

CREATE TABLE IF NOT EXISTS "CustomRoleMembers" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "discordRoleId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "givenBy" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS "CustomRoleMembers_guildId_discordRoleId_userId_key"
  ON "CustomRoleMembers" ("guildId", "discordRoleId", "userId");
CREATE INDEX IF NOT EXISTS "CustomRoleMembers_guildId_userId_idx"
  ON "CustomRoleMembers" ("guildId", "userId");

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

ALTER TABLE "CustomRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomRoleMembers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SupremeGrants" ENABLE ROW LEVEL SECURITY;
