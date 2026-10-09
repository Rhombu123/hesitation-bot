import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type GuildMember,
  type PartialGuildMember,
} from "discord.js";
import { config, EMBED_COLOR } from "../config.js";
import { MOUSE_EMOJI_ID } from "../utils/customEmojis.js";

/** Dedupe rapid GUILD_MEMBER_UPDATE bursts for the same user. */
const recentlyAnnounced = new Map<string, number>();
const DEDUPE_MS = 60_000;

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

function claimAnnounceSlot(guildId: string, userId: string): boolean {
  const key = `${guildId}:${userId}`;
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

function applyButtonRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Apply Here!")
      .setStyle(ButtonStyle.Link)
      .setEmoji(MOUSE_EMOJI_ID)
      .setURL(config.staffApplicationFormUrl),
  );
}

function buildHelperPromoEmbed(
  member: GuildMember,
  client: Client,
): EmbedBuilder {
  const mention = `<@${member.id}>`;
  const authorIcon =
    member.guild.iconURL({ size: 64 }) ??
    client.user?.displayAvatarURL({ size: 64 });

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: "Hesitation Helper Promotions",
      ...(authorIcon ? { iconURL: authorIcon } : {}),
    })
    .setDescription(
      [
        "✨ Congratulations and welcome to our newest 🛡️ **Helper!**",
        `• ${mention}`,
      ].join("\n"),
    );
}

/**
 * When someone is given the Helper role, post a Socialize-style promo embed
 * in the helper promotions channel with an Apply Here link to the mod form.
 */
export async function announceHelperPromotion(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<void> {
  const roleId = config.helperRoleId;
  const channelId = config.helperPromoChannelId;
  if (!roleId || !channelId) return;

  const had = memberHasRole(oldMember, roleId);
  const has = newMember.roles.cache.has(roleId);
  if (had || !has) return;

  if (!claimAnnounceSlot(newMember.guild.id, newMember.id)) {
    console.log(
      `[helperPromo] Skipping duplicate announce for ${newMember.user.tag}`,
    );
    return;
  }

  const channel = await newMember.client.channels
    .fetch(channelId)
    .catch((err) => {
      console.warn(`[helperPromo] Failed to fetch channel ${channelId}:`, err);
      return null;
    });

  if (!channel?.isTextBased() || channel.isDMBased() || !("send" in channel)) {
    console.warn(`[helperPromo] Channel ${channelId} missing or not sendable.`);
    return;
  }

  try {
    await channel.send({
      embeds: [buildHelperPromoEmbed(newMember, newMember.client)],
      components: [applyButtonRow()],
      allowedMentions: { users: [newMember.id] },
    });
    console.log(
      `[helperPromo] Announced Helper for ${newMember.user.tag} in ${channelId}`,
    );
  } catch (err) {
    console.error("[helperPromo] Failed to announce:", err);
    // Allow a retry if Discord send failed.
    recentlyAnnounced.delete(`${newMember.guild.id}:${newMember.id}`);
  }
}
