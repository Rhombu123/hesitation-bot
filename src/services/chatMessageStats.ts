import { config } from "../config.js";
import { sql } from "../db/postgres.js";
import { dailyDateString } from "../utils/helpers.js";
import { incrementChannelDailyMessages } from "./channelDailyMessages.js";
import { incrementDailyMessages } from "./dailyMessages.js";
import { incrementTotalMessages } from "./xp.js";

function isLoungeChannel(channelId: string): boolean {
  return (
    channelId === config.lounge1ChannelId ||
    channelId === config.lounge2ChannelId
  );
}

/**
 * Record one chat message: guild daily count, lifetime total, and lounge channel
 * daily count when applicable — direct Postgres RPC.
 */
export async function recordChatMessage(
  guildId: string,
  userId: string,
  channelId?: string | null,
): Promise<void> {
  const date = dailyDateString();
  const loungeChannel =
    channelId && isLoungeChannel(channelId) ? channelId : null;

  try {
    await sql`
      SELECT record_chat_message(
        ${guildId},
        ${userId},
        ${date},
        ${loungeChannel}
      )
    `;
  } catch (err) {
    console.warn(
      `[chatMessageStats] record_chat_message failed — fallback:`,
      err,
    );
    await incrementDailyMessages(guildId, userId);
    await incrementTotalMessages(guildId, userId);
    if (loungeChannel) {
      await incrementChannelDailyMessages(guildId, loungeChannel, userId);
    }
  }
}
