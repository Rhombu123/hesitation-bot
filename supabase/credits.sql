-- Credits (separate from currency points). Run in Supabase if needed.

CREATE TABLE IF NOT EXISTS "CreditsBalance" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditsBalance_guildId_userId_key"
  ON "CreditsBalance" ("guildId", "userId");

CREATE OR REPLACE FUNCTION add_credits(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_amount INT
) RETURNS "CreditsBalance"
LANGUAGE plpgsql
AS $$
DECLARE
  result "CreditsBalance";
BEGIN
  INSERT INTO "CreditsBalance" ("id", "guildId", "userId", "balance")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, GREATEST(0, p_amount))
  ON CONFLICT ("guildId", "userId")
  DO UPDATE SET "balance" = GREATEST(0, "CreditsBalance"."balance" + p_amount)
  RETURNING * INTO result;
  RETURN result;
END;
$$;

ALTER TABLE "CreditsBalance" ENABLE ROW LEVEL SECURITY;
