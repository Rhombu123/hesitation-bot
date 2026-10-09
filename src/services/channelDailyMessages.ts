import { newId, sql } from "../db/postgres.js";
import { dailyDateString } from "../utils/helpers.js";

/** Per-channel daily message counts (Lounge 1 / Lounge 2). */
export async function incrementChannelDailyMessages(
  guildId: string,
  channelId: string,
  userId: string,
): Promise<void> {
  const date = dailyDateString();
  await sql`
    SELECT increment_channel_daily_messages(
      ${guildId},
      ${channelId},
      ${userId},
      ${date}
    )
  `;
}

export async function getChannelDailyTop(
  guildId: string,
  channelId: string,
  limit = 10,
  date: string = dailyDateString(),
): Promise<{ userId: string; count: number }[]> {
  const rows = await sql`
    SELECT "userId", "count"
    FROM "ChannelDailyMessages"
    WHERE "guildId" = ${guildId}
      AND "channelId" = ${channelId}
      AND "date" = ${date}
    ORDER BY "count" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    count: Number(r.count),
  }));
}

export { newId };
