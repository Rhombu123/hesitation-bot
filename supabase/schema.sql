-- Hesitation Bot — Supabase schema + RPCs
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (IF NOT EXISTS / OR REPLACE).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Existing Prisma tables used camelCase — keep that so old data still works.

CREATE TABLE IF NOT EXISTS "UserStats" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "xp" INTEGER NOT NULL DEFAULT 0,
  "level" INTEGER NOT NULL DEFAULT 0,
  "totalMessages" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "UserStats_guildId_userId_key"
  ON "UserStats" ("guildId", "userId");
CREATE INDEX IF NOT EXISTS "UserStats_guildId_xp_idx"
  ON "UserStats" ("guildId", "xp");

CREATE TABLE IF NOT EXISTS "DailyMessages" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyMessages_guildId_userId_date_key"
  ON "DailyMessages" ("guildId", "userId", "date");
CREATE INDEX IF NOT EXISTS "DailyMessages_guildId_date_count_idx"
  ON "DailyMessages" ("guildId", "date", "count");

CREATE TABLE IF NOT EXISTS "ActionStats" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "ActionStats_guildId_userId_action_key"
  ON "ActionStats" ("guildId", "userId", "action");
CREATE INDEX IF NOT EXISTS "ActionStats_guildId_userId_idx"
  ON "ActionStats" ("guildId", "userId");
CREATE INDEX IF NOT EXISTS "ActionStats_guildId_action_count_idx"
  ON "ActionStats" ("guildId", "action", "count" DESC);

CREATE TABLE IF NOT EXISTS "Reputation" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "positive" INTEGER NOT NULL DEFAULT 0,
  "negative" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "Reputation_guildId_userId_key"
  ON "Reputation" ("guildId", "userId");
CREATE INDEX IF NOT EXISTS "Reputation_guildId_score_idx"
  ON "Reputation" ("guildId", "score");
CREATE INDEX IF NOT EXISTS "Reputation_guildId_positive_idx"
  ON "Reputation" ("guildId", "positive");

CREATE TABLE IF NOT EXISTS "ReputationLog" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "ReputationLog_guildId_toUserId_createdAt_idx"
  ON "ReputationLog" ("guildId", "toUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReputationLog_guildId_fromUserId_createdAt_idx"
  ON "ReputationLog" ("guildId", "fromUserId", "createdAt");

CREATE TABLE IF NOT EXISTS "DailyRepGiven" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "DailyRepGiven_guildId_userId_date_key"
  ON "DailyRepGiven" ("guildId", "userId", "date");
CREATE INDEX IF NOT EXISTS "DailyRepGiven_guildId_date_idx"
  ON "DailyRepGiven" ("guildId", "date");

/** Server currency (credits/points) — separate from XP and reputation. */
CREATE TABLE IF NOT EXISTS "CurrencyBalance" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "balance" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurrencyBalance_guildId_userId_key"
  ON "CurrencyBalance" ("guildId", "userId");

-- Atomic helpers (preferred path; bot falls back if missing)

CREATE OR REPLACE FUNCTION add_user_xp(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_amount INT
) RETURNS "UserStats"
LANGUAGE plpgsql
AS $$
DECLARE
  result "UserStats";
BEGIN
  INSERT INTO "UserStats" ("id", "guildId", "userId", "xp", "level", "totalMessages")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, p_amount, 0, 0)
  ON CONFLICT ("guildId", "userId")
  DO UPDATE SET "xp" = "UserStats"."xp" + EXCLUDED."xp"
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION increment_total_messages(
  p_guild_id TEXT,
  p_user_id TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "UserStats" ("id", "guildId", "userId", "xp", "level", "totalMessages")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, 0, 0, 1)
  ON CONFLICT ("guildId", "userId")
  DO UPDATE SET "totalMessages" = "UserStats"."totalMessages" + 1;
END;
$$;

CREATE OR REPLACE FUNCTION increment_daily_messages(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_date TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "DailyMessages" ("id", "guildId", "userId", "date", "count")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, p_date, 1)
  ON CONFLICT ("guildId", "userId", "date")
  DO UPDATE SET "count" = "DailyMessages"."count" + 1;
END;
$$;

CREATE OR REPLACE FUNCTION record_chat_message(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_date TEXT,
  p_channel_id TEXT DEFAULT NULL
) RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_total INT;
BEGIN
  INSERT INTO "DailyMessages" ("id", "guildId", "userId", "date", "count")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, p_date, 1)
  ON CONFLICT ("guildId", "userId", "date")
  DO UPDATE SET "count" = "DailyMessages"."count" + 1;

  INSERT INTO "UserStats" ("id", "guildId", "userId", "xp", "level", "totalMessages")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, 0, 0, 1)
  ON CONFLICT ("guildId", "userId")
  DO UPDATE SET "totalMessages" = "UserStats"."totalMessages" + 1
  RETURNING "totalMessages" INTO v_total;

  IF p_channel_id IS NOT NULL AND p_channel_id <> '' THEN
    INSERT INTO "ChannelDailyMessages" ("id", "guildId", "channelId", "userId", "date", "count")
    VALUES (gen_random_uuid()::text, p_guild_id, p_channel_id, p_user_id, p_date, 1)
    ON CONFLICT ("guildId", "channelId", "userId", "date")
    DO UPDATE SET "count" = "ChannelDailyMessages"."count" + 1;
  END IF;

  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION increment_action_received(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_action TEXT
) RETURNS "ActionStats"
LANGUAGE plpgsql
AS $$
DECLARE
  result "ActionStats";
BEGIN
  INSERT INTO "ActionStats" ("id", "guildId", "userId", "action", "count")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, p_action, 1)
  ON CONFLICT ("guildId", "userId", "action")
  DO UPDATE SET "count" = "ActionStats"."count" + 1
  RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION apply_reputation(
  p_guild_id TEXT,
  p_from_user_id TEXT,
  p_to_user_id TEXT,
  p_delta INT,
  p_date TEXT
) RETURNS "Reputation"
LANGUAGE plpgsql
AS $$
DECLARE
  result "Reputation";
  pos_inc INT := CASE WHEN p_delta > 0 THEN p_delta ELSE 0 END;
  neg_inc INT := CASE WHEN p_delta < 0 THEN ABS(p_delta) ELSE 0 END;
BEGIN
  INSERT INTO "Reputation" ("id", "guildId", "userId", "score", "positive", "negative")
  VALUES (gen_random_uuid()::text, p_guild_id, p_to_user_id, p_delta, pos_inc, neg_inc)
  ON CONFLICT ("guildId", "userId")
  DO UPDATE SET
    "score" = "Reputation"."score" + EXCLUDED."score",
    "positive" = "Reputation"."positive" + EXCLUDED."positive",
    "negative" = "Reputation"."negative" + EXCLUDED."negative"
  RETURNING * INTO result;

  INSERT INTO "ReputationLog" ("id", "guildId", "fromUserId", "toUserId", "amount")
  VALUES (gen_random_uuid()::text, p_guild_id, p_from_user_id, p_to_user_id, p_delta);

  INSERT INTO "DailyRepGiven" ("id", "guildId", "userId", "date", "count")
  VALUES (gen_random_uuid()::text, p_guild_id, p_from_user_id, p_date, 1)
  ON CONFLICT ("guildId", "userId", "date")
  DO UPDATE SET "count" = "DailyRepGiven"."count" + 1;

  RETURN result;
END;
$$;

/** Weekly Popular board — aggregate all ReputationLog rows in Postgres (no 1000-row cap). */
CREATE OR REPLACE FUNCTION get_weekly_rep_top(
  p_guild_id TEXT,
  p_since TIMESTAMPTZ,
  p_until TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 10
)
RETURNS TABLE ("userId" TEXT, points BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    rl."toUserId" AS "userId",
    SUM(rl."amount")::BIGINT AS points
  FROM "ReputationLog" rl
  WHERE rl."guildId" = p_guild_id
    AND rl."createdAt" >= p_since
    AND (p_until IS NULL OR rl."createdAt" < p_until)
  GROUP BY rl."toUserId"
  HAVING SUM(rl."amount") > 0
  ORDER BY points DESC, rl."toUserId" ASC
  LIMIT GREATEST(1, p_limit);
$$;

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

CREATE TABLE IF NOT EXISTS "CurrencyWeekly" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "weekId" TEXT NOT NULL,
  "points" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "CurrencyWeekly_guildId_userId_weekId_key"
  ON "CurrencyWeekly" ("guildId", "userId", "weekId");
CREATE INDEX IF NOT EXISTS "CurrencyWeekly_guildId_weekId_points_idx"
  ON "CurrencyWeekly" ("guildId", "weekId", "points");

CREATE OR REPLACE FUNCTION add_weekly_currency(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_week_id TEXT,
  p_amount INT
) RETURNS "CurrencyWeekly"
LANGUAGE plpgsql
AS $$
DECLARE
  result "CurrencyWeekly";
BEGIN
  INSERT INTO "CurrencyWeekly" ("id", "guildId", "userId", "weekId", "points")
  VALUES (gen_random_uuid()::text, p_guild_id, p_user_id, p_week_id, GREATEST(0, p_amount))
  ON CONFLICT ("guildId", "userId", "weekId")
  DO UPDATE SET "points" = GREATEST(0, "CurrencyWeekly"."points" + p_amount)
  RETURNING * INTO result;
  RETURN result;
END;
$$;

-- Bot uses the service_role key (bypasses RLS). Still enable RLS + deny anon.
ALTER TABLE "UserStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyMessages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActionStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reputation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ReputationLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DailyRepGiven" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CurrencyBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CurrencyWeekly" ENABLE ROW LEVEL SECURITY;

-- Supreme custom roles (one owned role per member; shareable via !role give)
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

ALTER TABLE "CustomRoles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CustomRoleMembers" ENABLE ROW LEVEL SECURITY;

-- Bot-tracked Supreme (30-day). Manual Discord grants have no row → never auto-expire.
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

-- Per-lounge daily message counts (!ltop 1 / !ltop 2)
CREATE TABLE IF NOT EXISTS "ChannelDailyMessages" (
  "id" TEXT PRIMARY KEY,
  "guildId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChannelDailyMessages_guildId_channelId_userId_date_key"
  ON "ChannelDailyMessages" ("guildId", "channelId", "userId", "date");
CREATE INDEX IF NOT EXISTS "ChannelDailyMessages_guildId_channelId_date_count_idx"
  ON "ChannelDailyMessages" ("guildId", "channelId", "date", "count");

CREATE OR REPLACE FUNCTION increment_channel_daily_messages(
  p_guild_id TEXT,
  p_channel_id TEXT,
  p_user_id TEXT,
  p_date TEXT
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "ChannelDailyMessages" ("id", "guildId", "channelId", "userId", "date", "count")
  VALUES (gen_random_uuid()::text, p_guild_id, p_channel_id, p_user_id, p_date, 1)
  ON CONFLICT ("guildId", "channelId", "userId", "date")
  DO UPDATE SET "count" = "ChannelDailyMessages"."count" + 1;
END;
$$;

ALTER TABLE "ChannelDailyMessages" ENABLE ROW LEVEL SECURITY;
