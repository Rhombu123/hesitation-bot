import {
  EmbedBuilder,
  type Message,
  type TextChannel,
  type Webhook,
} from "discord.js";
import { config } from "../config.js";
import { isChannelGameActive } from "./gameAutoSpawn.js";
import {
  STAFF_MAX_MS,
  formatUwuifyDuration,
  parseUwuifyDuration,
} from "./uwuify.js";

export type InvisibleSession = {
  expiresAt: number;
  appliedBy: string;
  guildId: string;
};

/** userId → active invisible session. */
const sessions = new Map<string, InvisibleSession>();

/** casterId → last successful apply timestamp. */
const castCooldowns = new Map<string, number>();

/** channelId → webhook for invisible spoofing. */
const webhookCache = new Map<string, Webhook>();

const WEBHOOK_NAME = "Hesitation Invisible";
/** Braille blank — Discord shows this as an almost-empty message. */
const INVISIBLE_CONTENT = "⠀";

/** Default + Mythic max — matches Socialize-style 2 minutes. */
export const INVISIBLE_DEFAULT_DURATION_MS = 2 * 60_000;
export const INVISIBLE_MYTHIC_MAX_MS = 2 * 60_000;
export const INVISIBLE_CAST_COOLDOWN_MS = 15 * 60_000;

export {
  STAFF_MAX_MS,
  formatUwuifyDuration as formatInvisibleDuration,
  parseUwuifyDuration as parseInvisibleDuration,
};

export function isLoungeChannel(channelId: string): boolean {
  return (
    channelId === config.lounge1ChannelId ||
    channelId === config.lounge2ChannelId
  );
}

export function getInvisibleSession(userId: string): InvisibleSession | null {
  const session = sessions.get(userId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

export function setInvisibleSession(
  userId: string,
  session: InvisibleSession,
): void {
  sessions.set(userId, session);
}

export function clearInvisibleSession(userId: string): boolean {
  return sessions.delete(userId);
}

export function getInvisibleCastCooldownRemaining(casterId: string): number {
  const last = castCooldowns.get(casterId);
  if (last == null) return 0;
  const remaining = INVISIBLE_CAST_COOLDOWN_MS - (Date.now() - last);
  if (remaining <= 0) {
    castCooldowns.delete(casterId);
    return 0;
  }
  return remaining;
}

export function markInvisibleCast(casterId: string): void {
  castCooldowns.set(casterId, Date.now());
}

const SUCCESS_GREEN = 0x57f287;

export function buildInvisibleEmbed(opts: {
  targetId: string;
  durationMs: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SUCCESS_GREEN)
    .setDescription(
      `<@${opts.targetId}> is now 👻 **Invisible Message** for **${formatUwuifyDuration(opts.durationMs)}**`,
    );
}

export function buildInvisibleStoppedEmbed(targetId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SUCCESS_GREEN)
    .setDescription(`<@${targetId}> is no longer 👻 **Invisible Message**.`);
}

async function getOrCreateWebhook(
  channel: TextChannel,
): Promise<Webhook | null> {
  const cached = webhookCache.get(channel.id);
  if (cached) return cached;

  try {
    const existing = await channel.fetchWebhooks();
    const mine = existing.find(
      (w) =>
        w.name === WEBHOOK_NAME && w.owner?.id === channel.client.user?.id,
    );
    if (mine) {
      webhookCache.set(channel.id, mine);
      return mine;
    }

    const created = await channel.createWebhook({
      name: WEBHOOK_NAME,
      reason: "Lounge invisible message spoofing",
    });
    webhookCache.set(channel.id, created);
    return created;
  } catch (err) {
    console.error(`[invisible] webhook setup failed in #${channel.id}:`, err);
    return null;
  }
}

/**
 * If the author is under invisible in a lounge, delete + webhook-repost blank.
 * Returns true when the message was handled (caller should stop).
 */
export async function tryHandleInvisibleMessage(
  message: Message<true>,
): Promise<boolean> {
  if (!isLoungeChannel(message.channelId)) return false;
  if (message.author.bot) return false;

  const session = getInvisibleSession(message.author.id);
  if (!session) return false;
  if (session.guildId !== message.guildId) return false;

  if (isChannelGameActive(message.channelId)) return false;

  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    return false;
  }

  const channel = message.channel as TextChannel;

  await message.delete().catch((err) => {
    console.warn(`[invisible] failed to delete message ${message.id}:`, err);
  });

  const webhook = await getOrCreateWebhook(channel);
  if (!webhook) {
    await channel
      .send({
        content:
          "Invisible is active but I need **Manage Webhooks** in this lounge.",
      })
      .catch(() => {});
    return true;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const username = member?.displayName ?? message.author.displayName;
  const avatarURL = message.author.displayAvatarURL({ size: 256 });

  try {
    await webhook.send({
      content: INVISIBLE_CONTENT,
      username: username.slice(0, 80) || "member",
      avatarURL,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[invisible] webhook send failed:", err);
    webhookCache.delete(channel.id);
  }

  return true;
}

/** Default duration when none given — 2 minutes. */
export function parseInvisibleDurationOrDefault(
  raw: string | undefined,
): number | null {
  if (!raw) return INVISIBLE_DEFAULT_DURATION_MS;
  return parseUwuifyDuration(raw);
}
