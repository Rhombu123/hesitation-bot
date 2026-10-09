import { sql } from "../db/postgres.js";

/** Increment how many times `userId` has received `action` in this guild. */
export async function incrementActionReceived(
  guildId: string,
  userId: string,
  action: string,
): Promise<number> {
  const rows = await sql`
    SELECT count FROM increment_action_received(${guildId}, ${userId}, ${action})
  `;
  return Number(rows[0]?.count ?? 1);
}

/** All action receive counts for a user in a guild (action → count). */
export async function getActionStatsMap(
  guildId: string,
  userId: string,
): Promise<Map<string, number>> {
  const rows = await sql`
    SELECT action, count
    FROM "ActionStats"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
  `;
  return new Map(rows.map((r) => [String(r.action), Number(r.count)]));
}

export type ActionLeaderboardRow = {
  userId: string;
  count: number;
};

/** Top receivers of one action in a guild (highest count first). */
export async function getTopByAction(
  guildId: string,
  action: string,
  limit = 10,
): Promise<ActionLeaderboardRow[]> {
  const rows = await sql`
    SELECT "userId", count
    FROM "ActionStats"
    WHERE "guildId" = ${guildId} AND action = ${action} AND count > 0
    ORDER BY count DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    count: Number(r.count),
  }));
}
