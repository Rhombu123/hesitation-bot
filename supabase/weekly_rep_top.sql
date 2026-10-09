-- Weekly Popular board: aggregate ReputationLog in Postgres (avoids PostgREST 1000-row cap)

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
