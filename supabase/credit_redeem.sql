-- Credit redeem: atomic spend + timed VIP/Elite + XP boosters.
-- Run in Supabase SQL Editor (or via DATABASE_URL) if not already applied.

CREATE OR REPLACE FUNCTION spend_credits(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_amount INT
) RETURNS "CreditsBalance"
LANGUAGE plpgsql
AS $$
DECLARE
  result "CreditsBalance";
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  UPDATE "CreditsBalance"
  SET "balance" = "balance" - p_amount
  WHERE "guildId" = p_guild_id
    AND "userId" = p_user_id
    AND "balance" >= p_amount
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_credits';
  END IF;

  RETURN result;
END;
$$;

-- Bot-tracked VIP / Elite (30-day). Manual Discord adds have no row → no auto-expire.
CREATE TABLE IF NOT EXISTS "TimedRoleGrants" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "roleKind" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS "TimedRoleGrants_guildId_userId_roleKind_key"
  ON "TimedRoleGrants" ("guildId", "userId", "roleKind");
CREATE INDEX IF NOT EXISTS "TimedRoleGrants_active_expiresAt_idx"
  ON "TimedRoleGrants" ("active", "expiresAt");
ALTER TABLE "TimedRoleGrants" ENABLE ROW LEVEL SECURITY;

-- Double XP booster (1 day per redeem; stacks by extending expiry).
CREATE TABLE IF NOT EXISTS "XpBoosters" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "grantedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "active" BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE UNIQUE INDEX IF NOT EXISTS "XpBoosters_guildId_userId_key"
  ON "XpBoosters" ("guildId", "userId");
CREATE INDEX IF NOT EXISTS "XpBoosters_active_expiresAt_idx"
  ON "XpBoosters" ("active", "expiresAt");
ALTER TABLE "XpBoosters" ENABLE ROW LEVEL SECURITY;
