import type { Message } from "discord.js";
import { isAppealsGuild } from "./appealsGuild.js";

/** True when action commands are allowed in this channel (anywhere except appeals). */
export function isActionChannel(_channelId: string): boolean {
  return true;
}

/**
 * Reply if actions are blocked in this guild.
 * Returns true when the caller should abort.
 */
export async function rejectUnlessActionChannel(
  message: Message<true>,
): Promise<boolean> {
  if (isAppealsGuild(message.guildId)) {
    await message.reply("Action commands are disabled in the Appeals server.");
    return true;
  }
  return false;
}
