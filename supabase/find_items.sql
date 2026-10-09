-- Find / inventory — run in Supabase SQL Editor (safe to re-run).

CREATE TABLE IF NOT EXISTS "FindInventory" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "itemName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "rolledPriceCents" INTEGER NOT NULL,
  "basePriceCents" INTEGER NOT NULL,
  "imageUrl" TEXT NOT NULL,
  "foundAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "weekId" TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS "FindInventory_guildId_userId_foundAt_idx"
  ON "FindInventory" ("guildId", "userId", "foundAt" DESC);

CREATE INDEX IF NOT EXISTS "FindInventory_guildId_weekId_idx"
  ON "FindInventory" ("guildId", "weekId");

CREATE INDEX IF NOT EXISTS "FindInventory_guildId_userId_idx"
  ON "FindInventory" ("guildId", "userId");

CREATE TABLE IF NOT EXISTS "FindCooldown" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastFindAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "FindCooldown_guildId_userId_key"
  ON "FindCooldown" ("guildId", "userId");
