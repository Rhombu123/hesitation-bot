import {
  EmbedBuilder,
  type Message,
  type TextChannel,
  type Webhook,
} from "discord.js";
import { EMBED_COLOR, config } from "../config.js";
import { isChannelGameActive } from "./gameAutoSpawn.js";

export type UwuifySession = {
  expiresAt: number;
  appliedBy: string;
  guildId: string;
};

/** userId → active session (in-memory; fine for short timers). */
const sessions = new Map<string, UwuifySession>();

/** casterId → last successful apply timestamp. */
const castCooldowns = new Map<string, number>();

/** channelId → webhook used for lounge uwuify reposts. */
const webhookCache = new Map<string, Webhook>();

const WEBHOOK_NAME = "Hesitation Uwuify";
export const DEFAULT_DURATION_MS = 60_000;
/** Non-staff (Mythic) max apply duration. */
export const MYTHIC_MAX_MS = 60_000;
/** @deprecated Use MYTHIC_MAX_MS */
export const SUPREME_MAX_MS = MYTHIC_MAX_MS;
/** Cooldown between applying uwuify (per caster). Stop does not use this. */
export const UWUIFY_CAST_COOLDOWN_MS = 15 * 60_000;

const FACES = [
  ":3",
  "UwU",
  "OwO",
  ">w<",
  "^^",
  ">.<",
  "🥺",
  "😳",
  "✨",
  "💕",
  "😊",
  "🥰",
] as const;

export function isLoungeChannel(channelId: string): boolean {
  return (
    channelId === config.lounge1ChannelId ||
    channelId === config.lounge2ChannelId
  );
}

export function getUwuifySession(userId: string): UwuifySession | null {
  const session = sessions.get(userId);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(userId);
    return null;
  }
  return session;
}

export function setUwuifySession(
  userId: string,
  session: UwuifySession,
): void {
  sessions.set(userId, session);
}

/** Clears an active session. Returns true if one was removed. */
export function clearUwuifySession(userId: string): boolean {
  return sessions.delete(userId);
}

/** Ms remaining on the caster's apply cooldown, or 0 if ready. */
export function getUwuifyCastCooldownRemaining(casterId: string): number {
  const last = castCooldowns.get(casterId);
  if (last == null) return 0;
  const remaining = UWUIFY_CAST_COOLDOWN_MS - (Date.now() - last);
  if (remaining <= 0) {
    castCooldowns.delete(casterId);
    return 0;
  }
  return remaining;
}

export function markUwuifyCast(casterId: string): void {
  castCooldowns.set(casterId, Date.now());
}

/** Soft max for staff durations (days/weeks). */
export const STAFF_MAX_MS = 30 * 24 * 60 * 60_000;

/** Parse `5min`, `30s`, `2h`, `3d`, `1w`. Returns ms or null if invalid. */
export function parseUwuifyDuration(raw: string | undefined): number | null {
  if (!raw) return DEFAULT_DURATION_MS;
  const m = raw
    .trim()
    .toLowerCase()
    .match(
      /^(\d+)\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|day|days|w|wk|wks|week|weeks)?$/,
    );
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[2] ?? "min";
  if (unit === "s" || unit === "sec" || unit === "secs") return n * 1_000;
  if (unit === "h" || unit === "hr" || unit === "hrs") return n * 3_600_000;
  if (unit === "d" || unit === "day" || unit === "days")
    return n * 24 * 3_600_000;
  if (
    unit === "w" ||
    unit === "wk" ||
    unit === "wks" ||
    unit === "week" ||
    unit === "weeks"
  ) {
    return n * 7 * 24 * 3_600_000;
  }
  return n * 60_000;
}

export function formatUwuifyDuration(ms: number): string {
  if (ms < 60_000) {
    const s = Math.round(ms / 1_000);
    return `${s} second${s === 1 ? "" : "s"}`;
  }
  if (ms < 3_600_000) {
    const mins = Math.round(ms / 60_000);
    return `${mins} minute${mins === 1 ? "" : "s"}`;
  }
  if (ms < 24 * 3_600_000) {
    const hours = Math.round(ms / 3_600_000);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  if (ms < 7 * 24 * 3_600_000) {
    const days = Math.round(ms / (24 * 3_600_000));
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  const weeks = Math.round(ms / (7 * 24 * 3_600_000));
  return `${weeks} week${weeks === 1 ? "" : "s"}`;
}

export function buildUwuifyStoppedEmbed(targetId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(`<@${targetId}> is no longer 🥺 **Uwuify**.`);
}

/** Classic uwu: r/R → w/W, light stutter, occasional face/emoji. */
export function uwuifyText(input: string): string {
  let text = input.replace(/r/g, "w").replace(/R/g, "W");

  text = text.replace(
    /\b([A-Za-z])([A-Za-z]*)\b/g,
    (word, first: string, rest: string) => {
      if (word.length < 3) return word;
      if (Math.random() > 0.22) return word;
      return `${first}-${first.toLowerCase()}${rest}`;
    },
  );

  if (Math.random() < 0.45) {
    const face = FACES[Math.floor(Math.random() * FACES.length)]!;
    text = `${text} ${face}`;
  }

  return text;
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
      reason: "Lounge uwuify message spoofing",
    });
    webhookCache.set(channel.id, created);
    return created;
  } catch (err) {
    console.error(`[uwuify] webhook setup failed in #${channel.id}:`, err);
    return null;
  }
}

/**
 * If the author is under uwuify in a lounge, delete + webhook-repost.
 * Returns true when the message was handled (caller should stop).
 */
export async function tryHandleUwuifyMessage(
  message: Message<true>,
): Promise<boolean> {
  if (!isLoungeChannel(message.channelId)) return false;
  if (message.author.bot) return false;

  const session = getUwuifySession(message.author.id);
  if (!session) return false;
  if (session.guildId !== message.guildId) return false;

  // Lounge 1 is the games channel — let messages through normally during rounds.
  if (isChannelGameActive(message.channelId)) return false;

  const raw = message.content?.trim() ?? "";
  const hasAttachments = message.attachments.size > 0;

  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    return false;
  }

  const channel = message.channel as TextChannel;

  await message.delete().catch((err) => {
    console.warn(`[uwuify] failed to delete message ${message.id}:`, err);
  });

  if (!raw && !hasAttachments) return true;

  const webhook = await getOrCreateWebhook(channel);
  if (!webhook) {
    await channel
      .send({
        content:
          "Uwuify is active but I need **Manage Webhooks** in this lounge.",
      })
      .catch(() => {});
    return true;
  }

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  const username = member?.displayName ?? message.author.displayName;
  const avatarURL = message.author.displayAvatarURL({ size: 256 });

  const content = raw ? uwuifyText(raw) : "";
  const clipped = content.slice(0, 2000);

  try {
    await webhook.send({
      content: clipped || undefined,
      username: username.slice(0, 80) || "member",
      avatarURL,
      files: hasAttachments
        ? [...message.attachments.values()].map((a) => a.url)
        : undefined,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    console.error("[uwuify] webhook send failed:", err);
    webhookCache.delete(channel.id);
  }

  return true;
}

export function buildUwuifyEmbed(opts: {
  targetId: string;
  durationMs: number;
}): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(
      `<@${opts.targetId}> is now 🥺 **Uwuify** for **${formatUwuifyDuration(opts.durationMs)}**`,
    );
}
