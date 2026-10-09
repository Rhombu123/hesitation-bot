-- Single RPC for daily + total + optional lounge channel message counts

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
