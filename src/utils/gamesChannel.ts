import type { Message } from "discord.js";
import { config } from "../config.js";
import { isAppealsGuild } from "./appealsGuild.js";

/**
 * Block games in the Appeals server only.
 * Manual spawn commands can run in any text channel; auto-spawn stays in lounges.
 * Returns true when the caller should abort.
 */
export async function rejectUnlessGamesChannel(
  message: Message<true>,
): Promise<boolean> {
  if (isAppealsGuild(message.guildId)) {
    await message.reply("Games are disabled in the Appeals server.");
    return true;
  }
  return false;
}

/** Lounge 1 + Lounge 2 — where `!games` / `!random` may be used. */
export function isGamesDropLounge(channelId: string): boolean {
  return (
    channelId === config.lounge1ChannelId ||
    channelId === config.lounge2ChannelId
  );
}

/**
 * Restrict `!games` / `!random` to the two main lounges.
 * Returns true when the caller should abort.
 */
export async function rejectUnlessGamesDropLounge(
  message: Message<true>,
): Promise<boolean> {
  if (await rejectUnlessGamesChannel(message)) return true;
  if (isGamesDropLounge(message.channelId)) return false;
  await message.reply(
    `Use \`!games\` in <#${config.lounge1ChannelId}> or <#${config.lounge2ChannelId}>.`,
  );
  return true;
}
