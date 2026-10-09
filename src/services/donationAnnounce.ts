import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
} from "discord.js";
import { config } from "../config.js";
import {
  ELITE_CROWN_EMOJI_ID,
  ELITE_CROWN_EMOJI_NAME,
  MOUSE_EMOJI_ID,
  resolveEmojiById,
  SUPREME_CROWN_EMOJI_ID,
  SUPREME_CROWN_EMOJI_NAME,
  VIP_CROWN_EMOJI_ID,
  VIP_CROWN_EMOJI_NAME,
} from "../utils/customEmojis.js";

export type DonationTier = "vip" | "elite" | "supreme" | "mythic";

type TierStyle = {
  color: number;
  label: string;
  footer: string;
  emojiId: string;
  emojiName: string;
};

const MYTHIC_CROWN_FALLBACK = {
  emojiId: SUPREME_CROWN_EMOJI_ID,
  emojiName: SUPREME_CROWN_EMOJI_NAME,
};

const TIER_STYLES: Record<DonationTier, TierStyle> = {
  vip: {
    color: 0xf0b232,
    label: "VIP",
    footer: "Want to unlock cool special perks?",
    emojiId: VIP_CROWN_EMOJI_ID,
    emojiName: VIP_CROWN_EMOJI_NAME,
  },
  elite: {
    color: 0x9b59b6,
    label: "Elite",
    footer: "Want to unlock cool special perks?",
    emojiId: ELITE_CROWN_EMOJI_ID,
    emojiName: ELITE_CROWN_EMOJI_NAME,
  },
  supreme: {
    color: 0xed4245,
    label: "Supreme",
    footer: "Want a custom role?",
    emojiId: SUPREME_CROWN_EMOJI_ID,
    emojiName: SUPREME_CROWN_EMOJI_NAME,
  },
  mythic: {
    color: 0xe67e22,
    label: "Mythic",
    footer: "Want Mythic perks?",
    emojiId: MYTHIC_CROWN_FALLBACK.emojiId,
    emojiName: MYTHIC_CROWN_FALLBACK.emojiName,
  },
};

/**
 * Post a Socialize-style “just donated!” embed when VIP / Elite / Supreme / Mythic
 * is purchased with credits, Stripe, or granted via `!give`.
 */
export async function announceDonation(
  member: GuildMember,
  tier: DonationTier,
): Promise<void> {
  const channelId = config.donationChannelId;
  if (!channelId) return;

  const style = TIER_STYLES[tier];
  const channel = await member.client.channels.fetch(channelId).catch((err) => {
    console.warn(`[donate] Failed to fetch channel ${channelId}:`, err);
    return null;
  });

  if (!channel?.isTextBased() || channel.isDMBased() || !("send" in channel)) {
    console.warn(`[donate] Channel ${channelId} missing or not sendable.`);
    return;
  }

  if ("guildId" in channel && channel.guildId !== member.guild.id) {
    console.log(
      `[donate] Skipping — channel is in guild ${channel.guildId}, member in ${member.guild.id}`,
    );
    return;
  }

  const crown = await resolveEmojiById(
    member.guild,
    style.emojiId,
    style.emojiName,
  );

  const mention = `<@${member.id}>`;
  // Mythic: username only (never display/global name). Other tiers keep display name.
  const authorName =
    tier === "mythic"
      ? `${member.user.username} just donated!`
      : `${member.displayName} just donated!`;

  const botAvatar =
    member.client.user?.displayAvatarURL({ size: 256 }) ??
    member.displayAvatarURL({ size: 256 });

  const embed = new EmbedBuilder()
    .setColor(0x143b96)
    .setAuthor({
      name: authorName,
      iconURL: member.displayAvatarURL({ size: 64 }),
    })
    .setDescription(`${mention} is now ${crown} **${style.label}** ${crown}`)
    .setFooter({ text: style.footer })
    .setThumbnail(botAvatar);

  const shopUrl = `${config.shopPublicUrl.replace(/\/$/, "")}/shop`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Purchase Here")
      .setStyle(ButtonStyle.Link)
      .setEmoji(MOUSE_EMOJI_ID)
      .setURL(shopUrl),
  );

  try {
    await channel.send({
      content: mention,
      embeds: [embed],
      components: [row],
      allowedMentions: { users: [member.id] },
    });
    console.log(
      `[donate] Announced ${tier} for ${member.user.tag} in ${channelId}`,
    );
  } catch (err) {
    console.error("[donate] Failed to announce:", err);
  }
}
