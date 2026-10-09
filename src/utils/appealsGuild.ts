import type { Client } from "discord.js";
import { config } from "../config.js";

/** Cached appeals guild id (env or resolved from rules channel). */
let resolvedAppealsGuildId: string | null = config.appealsGuildId ?? null;

/**
 * Hesitation Appeals server id — features like XP, actions, and games are off there.
 */
export async function getAppealsGuildId(
  client: Client,
): Promise<string | null> {
  if (resolvedAppealsGuildId) return resolvedAppealsGuildId;
  if (config.appealsGuildId) {
    resolvedAppealsGuildId = config.appealsGuildId;
    return resolvedAppealsGuildId;
  }

  const channelId = config.appealsRulesChannelId;
  if (!channelId) return null;

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && "guildId" in channel && typeof channel.guildId === "string") {
    resolvedAppealsGuildId = channel.guildId;
    return resolvedAppealsGuildId;
  }
  return null;
}

/** Sync check after `getAppealsGuildId` / ready has resolved the id. */
export function isAppealsGuild(guildId: string): boolean {
  if (config.appealsGuildId && guildId === config.appealsGuildId) return true;
  return resolvedAppealsGuildId != null && guildId === resolvedAppealsGuildId;
}

/** Warm the appeals guild id cache (call on ready). */
export async function resolveAppealsGuildId(client: Client): Promise<void> {
  await getAppealsGuildId(client);
}
