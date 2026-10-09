-- Run in Supabase SQL Editor if you already applied the earlier schema.

CREATE TABLE IF NOT EXISTS "CurrencyBalance" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurrencyBalance_guildId_userId_key"
  ON "CurrencyBalance" ("guildId", "userId");

CREATE OR REPLACE FUNCTION add_currency(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_amount INT
) RETURNS "CurrencyBalance"
LANGUAGE plpgsql
AS $$
DECLARE
  result "CurrencyBalance";
BEGIN
  INSERT INTO "CurrencyBalance" ("id", "guildId", "userId", "balance")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, GREATEST(0, p_amount))
  ON CONFLICT ("guildId", "userId")
  DO UPDATE SET "balance" = GREATEST(0, "CurrencyBalance"."balance" + p_amount)
  RETURNING * INTO result;
  RETURN result;
END;
$$;

ALTER TABLE "CurrencyBalance" ENABLE ROW LEVEL SECURITY;
