import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageType,
  type GuildMember,
  type Message,
  type PartialGuildMember,
  type SendableChannels,
  type TextBasedChannel,
} from "discord.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";

const BOOST_EMBED_COLOR = 0x143b96;
const THUMB_NAME = "booster-thumb.gif";

/** Dedupe guildMemberUpdate fallback + system boost message. */
const recentlyAnnounced = new Map<string, number>();
const DEDUPE_MS = 60_000;

/** Wait for Discord’s system boost message before falling back. */
const MEMBER_UPDATE_FALLBACK_MS = 5_000;

const BOOST_MESSAGE_TYPES = new Set<MessageType>([
  MessageType.GuildBoost,
  MessageType.GuildBoostTier1,
  MessageType.GuildBoostTier2,
  MessageType.GuildBoostTier3,
]);

function thumbPath(): string {
  return join(process.cwd(), "assets", THUMB_NAME);
}

function memberHasRole(
  member: GuildMember | PartialGuildMember,
  roleId: string,
): boolean {
  if (!roleId) return false;
  const roles = member.roles;
  if (roles && "cache" in roles && roles.cache) {
    return roles.cache.has(roleId);
  }
  if (Array.isArray(roles)) return roles.includes(roleId);
  return false;
}

/**
 * True when the member just started boosting this server.
 * Uses premiumSince and/or the Server Booster role — Discord sometimes
 * only sends one of those in a given GUILD_MEMBER_UPDATE.
 */
export function isNewServerBoost(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): boolean {
  const wasBoosting = oldMember.premiumSince != null;
  const isBoosting = newMember.premiumSince != null;
  if (!wasBoosting && isBoosting) return true;

  const boosterRole = newMember.guild.roles.premiumSubscriberRole;
  if (boosterRole) {
    const hadRole = memberHasRole(oldMember, boosterRole.id);
    const hasRole = newMember.roles.cache.has(boosterRole.id);
    if (!hadRole && hasRole) return true;
  }

  return false;
}

function announceKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function wasRecentlyAnnounced(guildId: string, userId: string): boolean {
  const prev = recentlyAnnounced.get(announceKey(guildId, userId));
  return prev != null && Date.now() - prev < DEDUPE_MS;
}

function claimAnnounceSlot(guildId: string, userId: string): boolean {
  const key = announceKey(guildId, userId);
  const now = Date.now();
  const prev = recentlyAnnounced.get(key);
  if (prev != null && now - prev < DEDUPE_MS) return false;
  recentlyAnnounced.set(key, now);
  if (recentlyAnnounced.size > 200) {
    for (const [k, t] of recentlyAnnounced) {
      if (now - t > DEDUPE_MS) recentlyAnnounced.delete(k);
    }
  }
  return true;
}

/**
 * Discord system “X just boosted the server!” — preferred path so our embed
 * is posted *after* that message in the same channel.
 */
export async function tryAnnounceFromBoostSystemMessage(
  message: Message,
): Promise<boolean> {
  if (!message.guild || message.author.bot) return false;
  if (!BOOST_MESSAGE_TYPES.has(message.type)) return false;

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    console.warn(
      `[boost] System boost message from ${message.author.id} but member missing.`,
    );
    return false;
  }

  console.log(
    `[boost] System boost message from ${member.user.tag} (type=${message.type})`,
  );

  // Post in the system-message channel when it matches the announce channel
  // (guarantees order: Discord message first, then our embed).
  const preferChannel =
    message.channel.isTextBased() && !message.channel.isDMBased()
      ? message.channel
      : undefined;

  await announceServerBoost(member, { preferChannel });
  return true;
}

/**
 * If `guildMemberUpdate` saw a boost first, wait so the system message can
 * land and trigger the preferred path; only announce if nothing posted yet.
 */
export function scheduleBoostAnnounceFallback(member: GuildMember): void {
  const guildId = member.guild.id;
  const userId = member.id;
  setTimeout(() => {
    void (async () => {
      if (wasRecentlyAnnounced(guildId, userId)) {
        console.log(
          `[boost] Fallback skipped — already announced for ${member.user.tag}`,
        );
        return;
      }
      const fresh = await member.guild.members.fetch(userId).catch(() => null);
      if (!fresh || fresh.premiumSince == null) {
        const boosterRole = member.guild.roles.premiumSubscriberRole;
        if (!boosterRole || !fresh?.roles.cache.has(boosterRole.id)) {
          console.log(
            `[boost] Fallback skipped — ${member.user.tag} no longer boosting`,
          );
          return;
        }
      }
      console.log(`[boost] Fallback announce for ${member.user.tag}`);
      await announceServerBoost(fresh ?? member);
    })().catch((err) => console.error("[boost] fallback failed:", err));
  }, MEMBER_UPDATE_FALLBACK_MS);
}

/**
 * Post the “just boosted!” unlock embed in the boost announce channel.
 */
export async function announceServerBoost(
  member: GuildMember,
  opts?: { preferChannel?: TextBasedChannel & SendableChannels },
): Promise<void> {
  const channelId = config.boostAnnounceChannelId;
  if (!channelId) {
    console.warn("[boost] No boostAnnounceChannelId configured.");
    return;
  }

  if (!claimAnnounceSlot(member.guild.id, member.id)) {
    console.log(
      `[boost] Skipping duplicate announce for ${member.user.tag}`,
    );
    return;
  }

  let channel: (TextBasedChannel & SendableChannels) | null = null;

  // Prefer the channel that just received Discord’s system boost message
  // when it is the configured announce channel (correct message order).
  if (
    opts?.preferChannel &&
    "id" in opts.preferChannel &&
    opts.preferChannel.id === channelId &&
    opts.preferChannel.isTextBased() &&
    !opts.preferChannel.isDMBased() &&
    "send" in opts.preferChannel
  ) {
    channel = opts.preferChannel as TextBasedChannel & SendableChannels;
  } else {
    const fetched = await member.client.channels
      .fetch(channelId)
      .catch((err) => {
        console.warn(`[boost] Failed to fetch channel ${channelId}:`, err);
        return null;
      });
    if (
      fetched?.isTextBased() &&
      !fetched.isDMBased() &&
      "send" in fetched
    ) {
      channel = fetched as TextBasedChannel & SendableChannels;
    }
  }

  if (!channel) {
    console.warn(`[boost] Channel ${channelId} missing or not sendable.`);
    return;
  }

  if ("guildId" in channel && channel.guildId !== member.guild.id) {
    console.log(
      `[boost] Skipping announce — boost was in guild ${member.guild.id}, channel is in ${channel.guildId}.`,
    );
    return;
  }

  const perks = [
    "🎤 **Voice messages**",
    "🖼️ **Picture permissions**",
    "🌸 **External stickers**",
    "✨ **10 rep per give · 4 gives per day**",
    "🧤 **Access to** `!kiss` `!dap` `!hug`",
  ];

  const embed = new EmbedBuilder()
    .setColor(BOOST_EMBED_COLOR)
    .setAuthor({
      name: `${member.displayName} just boosted!`,
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription(["```You have unlocked```", "", ...perks].join("\n"))
    .setFooter({ text: "Thank you for boosting" })
    .setTimestamp();

  const files: AttachmentBuilder[] = [];
  const path = thumbPath();
  if (existsSync(path)) {
    files.push(new AttachmentBuilder(readFileSync(path), { name: THUMB_NAME }));
    embed.setThumbnail(`attachment://${THUMB_NAME}`);
  } else {
    console.warn(`[boost] Missing ${path} — posting without thumbnail.`);
  }

  const guildId = member.guild.id;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Boost Now")
      .setStyle(ButtonStyle.Link)
      .setEmoji("💎")
      .setURL(`https://discord.com/channels/${guildId}/${channelId}`),
  );

  try {
    await channel.send({ embeds: [embed], files, components: [row] });
    console.log(
      `[boost] Announced boost from ${member.user.tag} in ${channelId}`,
    );
  } catch (err) {
    console.error("[boost] Failed to announce:", err);
  }
}
