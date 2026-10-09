import { config, REP_IMMUNE_USER_IDS } from "../config.js";
import { newId, sql } from "../db/postgres.js";
import { utcDateString, utcWeekStart } from "../utils/helpers.js";
import { queueWeeklyBoardRefresh } from "./weeklyRoleQueue.js";

/** True if this user is blocked from receiving any reputation changes. */
export function isRepImmune(userId: string): boolean {
  return REP_IMMUNE_USER_IDS.has(userId);
}
export type ReputationStats = {
  score: number;
  positive: number;
  negative: number;
};

export type RepRank = {
  /** Sign of this user's current score. */
  kind: "positive" | "negative";
  /** 1-based rank on the matching all-time board. */
  rank: number;
};

function mapRep(row: Record<string, unknown>): ReputationStats {
  return {
    score: Number(row.score ?? 0),
    positive: Number(row.positive ?? 0),
    negative: Number(row.negative ?? 0),
  };
}

export async function getOrCreateReputation(
  guildId: string,
  userId: string,
): Promise<ReputationStats> {
  const existing = await sql`
    SELECT "score", "positive", "negative"
    FROM "Reputation"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
    LIMIT 1
  `;
  if (existing[0]) return mapRep(existing[0] as Record<string, unknown>);

  try {
    const inserted = await sql`
      INSERT INTO "Reputation" ("id", "guildId", "userId", "score", "positive", "negative")
      VALUES (${newId()}, ${guildId}, ${userId}, 0, 0, 0)
      RETURNING "score", "positive", "negative"
    `;
    return mapRep(inserted[0] as Record<string, unknown>);
  } catch (err) {
    const again = await sql`
      SELECT "score", "positive", "negative"
      FROM "Reputation"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      LIMIT 1
    `;
    if (again[0]) return mapRep(again[0] as Record<string, unknown>);
    throw err;
  }
}

/**
 * Score + rank in one query (no insert). Used by `!rep` so the embed
 * doesn't wait on two HTTP round trips.
 */
export async function getReputationSnapshot(
  guildId: string,
  userId: string,
): Promise<{ stats: ReputationStats; rank: RepRank | null }> {
  const rows = await sql`
    WITH me AS (
      SELECT "score", "positive", "negative"
      FROM "Reputation"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      LIMIT 1
    )
    SELECT
      COALESCE(me.score, 0) AS score,
      COALESCE(me.positive, 0) AS positive,
      COALESCE(me.negative, 0) AS negative,
      CASE
        WHEN me.score > 0 THEN (
          SELECT COUNT(*)::int + 1
          FROM "Reputation"
          WHERE "guildId" = ${guildId} AND score > me.score
        )
        WHEN me.score < 0 THEN (
          SELECT COUNT(*)::int + 1
          FROM "Reputation"
          WHERE "guildId" = ${guildId} AND score < me.score
        )
        ELSE NULL
      END AS rank
    FROM (SELECT 1) AS _
    LEFT JOIN me ON true
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  const stats = mapRep(row ?? {});
  const rankNum = row?.rank == null ? null : Number(row.rank);
  const rank: RepRank | null =
    rankNum == null || !Number.isFinite(rankNum)
      ? null
      : { kind: stats.score < 0 ? "negative" : "positive", rank: rankNum };
  return { stats, rank };
}

export async function getDailyRepGiven(
  guildId: string,
  userId: string,
): Promise<number> {
  const date = utcDateString();
  const rows = await sql`
    SELECT count
    FROM "DailyRepGiven"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId} AND date = ${date}
    LIMIT 1
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function getRepsLeftToday(
  guildId: string,
  userId: string,
  dailyLimit: number = config.repDailyLimit,
): Promise<number> {
  const used = await getDailyRepGiven(guildId, userId);
  return Math.max(0, dailyLimit - used);
}

const REP_SAME_TARGET_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * True if `fromUserId` already gave +rep/−rep to `toUserId` within the last 24h.
 * Returns when they can try again (last give + 24h).
 */
export async function getSameTargetRepCooldown(
  guildId: string,
  fromUserId: string,
  toUserId: string,
): Promise<{ blocked: boolean; retryInMs: number }> {
  const since = new Date(Date.now() - REP_SAME_TARGET_COOLDOWN_MS);
  const rows = await sql`
    SELECT "createdAt"
    FROM "ReputationLog"
    WHERE "guildId" = ${guildId}
      AND "fromUserId" = ${fromUserId}
      AND "toUserId" = ${toUserId}
      AND "createdAt" >= ${since}
    ORDER BY "createdAt" DESC
    LIMIT 1
  `;
  const createdAt = rows[0]?.createdAt;
  if (!createdAt) {
    return { blocked: false, retryInMs: 0 };
  }

  const lastAt = new Date(createdAt as string | Date).getTime();
  const retryInMs = Math.max(0, lastAt + REP_SAME_TARGET_COOLDOWN_MS - Date.now());
  return { blocked: retryInMs > 0, retryInMs };
}

/** Milliseconds until next UTC midnight. */
export function msUntilNextUtcMidnight(now = new Date()): number {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
  );
  return Math.max(0, next - now.getTime());
}

/** Format like Socialize: `23 hours, 59 minutes and 51 seconds` */
export function formatWaitDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`\`${hours}\` hour${hours === 1 ? "" : "s"}`);
  if (minutes > 0 || hours > 0) {
    parts.push(`\`${minutes}\` minute${minutes === 1 ? "" : "s"}`);
  }
  parts.push(`\`${seconds}\` second${seconds === 1 ? "" : "s"}`);
  if (parts.length === 1) return parts[0]!;
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]} and ${parts[2]}`;
}

/** How many points this giver awards on +rep (level 60+ → 5). */
export function positiveRepAmount(giverLevel: number): number {
  if (giverLevel >= config.repBoostLevel) return config.repBoostAmount;
  return 1;
}

export async function applyReputation(opts: {
  guildId: string;
  fromUserId: string;
  toUserId: string;
  /** Positive for +rep, negative for −rep. */
  delta: number;
}): Promise<ReputationStats> {
  const { guildId, fromUserId, toUserId, delta } = opts;
  if (delta === 0 || isRepImmune(toUserId)) {
    return getOrCreateReputation(guildId, toUserId);
  }

  const rows = await sql`
    SELECT "score", "positive", "negative"
    FROM apply_reputation(
      ${guildId},
      ${fromUserId},
      ${toUserId},
      ${delta},
      ${utcDateString()}
    )
  `;
  queueWeeklyBoardRefresh("popular");
  return mapRep(rows[0] as Record<string, unknown>);
}

/**
 * Award reputation from a system source (e.g. flag game).
 * Does not consume the giver's daily +rep/−rep allowance.
 */
export async function grantSystemReputation(opts: {
  guildId: string;
  userId: string;
  amount: number;
  source?: string;
}): Promise<ReputationStats> {
  const { guildId, userId, amount } = opts;
  if (amount === 0 || isRepImmune(userId)) {
    return getOrCreateReputation(guildId, userId);
  }
  const fromUserId = opts.source ?? "system";

  const current = await getOrCreateReputation(guildId, userId);
  const positiveInc = amount > 0 ? amount : 0;
  const negativeInc = amount < 0 ? Math.abs(amount) : 0;
  const next = {
    score: current.score + amount,
    positive: current.positive + positiveInc,
    negative: current.negative + negativeInc,
  };

  await sql`
    UPDATE "Reputation"
    SET "score" = ${next.score},
        "positive" = ${next.positive},
        "negative" = ${next.negative}
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
  `;
  await sql`
    INSERT INTO "ReputationLog" ("id", "guildId", "fromUserId", "toUserId", "amount")
    VALUES (${newId()}, ${guildId}, ${fromUserId}, ${userId}, ${amount})
  `;

  queueWeeklyBoardRefresh("popular");
  return next;
}

/**
 * Rank on the all-time popular board (score > 0) or hated board (score < 0).
 * Null when score is 0.
 */
export async function getRepRank(
  guildId: string,
  userId: string,
): Promise<RepRank | null> {
  const snap = await getReputationSnapshot(guildId, userId);
  return snap.rank;
}

export async function getReputationLog(
  guildId: string,
  userId: string,
  limit = 15,
): Promise<
  { fromUserId: string; toUserId: string; amount: number; createdAt: Date }[]
> {
  const rows = await sql`
    SELECT "fromUserId", "toUserId", amount, "createdAt"
    FROM "ReputationLog"
    WHERE "guildId" = ${guildId} AND "toUserId" = ${userId}
    ORDER BY "createdAt" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    fromUserId: String(r.fromUserId),
    toUserId: String(r.toUserId),
    amount: Number(r.amount),
    createdAt: new Date(r.createdAt as string | Date),
  }));
}

/**
 * Top users by reputation change in a UTC week window (score up minus score down).
 * Defaults to the current week (since Monday 00:00 UTC → now).
 * Only users whose weekly total is still positive are returned.
 *
 * Prefer the SQL RPC (aggregates in Postgres). Falls back to paginated log reads
 * so we never silently stop at PostgREST's ~1000-row default.
 */
export async function getWeeklyRepTop(
  guildId: string,
  limit = 10,
  opts?: { since?: Date; until?: Date },
): Promise<Array<{ userId: string; points: number }>> {
  const since = opts?.since ?? utcWeekStart();
  const until = opts?.until ?? null;

  const rows = await sql`
    SELECT "userId", points
    FROM get_weekly_rep_top(${guildId}, ${since}, ${until}, ${limit})
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    points: Number(r.points),
  }));
}

/** Top all-time reputation by current score (highest first). */
export async function getAllTimeRepTop(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; points: number }>> {
  const rows = await sql`
    SELECT "userId", score
    FROM "Reputation"
    WHERE "guildId" = ${guildId} AND score > 0
    ORDER BY score DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    points: Number(r.score),
  }));
}

/**
 * Lowest (most negative) all-time scores.
 * `points` is the absolute value of the negative score (display as −N).
 */
export async function getAllTimeHatedTop(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; points: number }>> {
  const rows = await sql`
    SELECT "userId", score
    FROM "Reputation"
    WHERE "guildId" = ${guildId} AND score < 0
    ORDER BY score ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    points: Math.abs(Number(r.score)),
  }));
}
