import { newId, sql } from "../db/postgres.js";
import { dailyDateString } from "../utils/helpers.js";

export async function incrementDailyMessages(
  guildId: string,
  userId: string,
): Promise<void> {
  const date = dailyDateString();
  await sql`SELECT increment_daily_messages(${guildId}, ${userId}, ${date})`;
}

export async function getDailyTop(
  guildId: string,
  limit = 10,
  date: string = dailyDateString(),
): Promise<{ userId: string; count: number }[]> {
  const rows = await sql`
    SELECT "userId", "count"
    FROM "DailyMessages"
    WHERE "guildId" = ${guildId} AND "date" = ${date}
    ORDER BY "count" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    count: Number(r.count),
  }));
}

export async function getDailyCount(
  guildId: string,
  userId: string,
): Promise<number> {
  const date = dailyDateString();
  const rows = await sql`
    SELECT "count" FROM "DailyMessages"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId} AND "date" = ${date}
    LIMIT 1
  `;
  return Number(rows[0]?.count ?? 0);
}

/** Keep newId available for any callers that previously imported via this module path. */
export { newId };
