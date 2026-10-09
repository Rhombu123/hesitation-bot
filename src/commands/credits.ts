import {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  type Interaction,
  type Message,
} from "discord.js";
import { CREDITS_EMBED_COLOR, config } from "../config.js";
import { ROLE_IDS } from "../config/rolePrivileges.js";
import {
  addCredits,
  getOrCreateCredits,
  InsufficientCreditsError,
  spendCredits,
} from "../services/credits.js";
import { grantBotSupreme } from "../services/supremeGrants.js";
import { announceDonation } from "../services/donationAnnounce.js";
import {
  grantTimedPaidRole,
  type PaidRoleKind,
} from "../services/timedRoleGrants.js";
import { grantXpBooster } from "../services/xpBoosters.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  ELITE_CROWN_EMOJI_ID,
  ELITE_CROWN_EMOJI_NAME,
  resolveEmojiById,
  SUPREME_CROWN_EMOJI_ID,
  SUPREME_CROWN_EMOJI_NAME,
  VIP_CROWN_EMOJI_ID,
  VIP_CROWN_EMOJI_NAME,
} from "../utils/customEmojis.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";
import { isStaffMember } from "../utils/staff.js";

export type RedeemItemId =
  | "double_xp_1d"
  | "vip_1m"
  | "elite_1m"
  | "supreme_1m";

/** Shop catalog — credits redeem. */
export const REDEEM_ITEMS = [
  {
    id: "double_xp_1d" as const,
    emoji: "🧪",
    label: "Double XP Booster",
    duration: "[1 Day]",
    cost: 250,
  },
  {
    id: "vip_1m" as const,
    emojiId: VIP_CROWN_EMOJI_ID,
    emojiName: VIP_CROWN_EMOJI_NAME,
    label: "VIP Role",
    duration: "(1 Month)",
    cost: 1000,
  },
  {
    id: "elite_1m" as const,
    emojiId: ELITE_CROWN_EMOJI_ID,
    emojiName: ELITE_CROWN_EMOJI_NAME,
    label: "Elite Role",
    duration: "(1 Month)",
    cost: 2000,
  },
  {
    id: "supreme_1m" as const,
    emojiId: SUPREME_CROWN_EMOJI_ID,
    emojiName: SUPREME_CROWN_EMOJI_NAME,
    label: "Supreme",
    duration: "(1 Month)",
    cost: 5000,
  },
] as const;

export const CREDITS_SELECT_PREFIX = "credits:redeem:";

function selectCustomId(userId: string): string {
  return `${CREDITS_SELECT_PREFIX}${userId}`;
}

export async function handleCreditsCommand(
  message: Message<true>,
  args: string[] = [],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members
      .fetch({ user: message.author.id, force: true })
      .catch(() => null));

  const staffBypass = author ? isStaffMember(author) : false;
  if (!staffBypass && message.channelId !== config.levelCommandChannelId) {
    await message.reply(
      `Use \`!credits\` in <#${config.levelCommandChannelId}> only.`,
    );
    return;
  }

  const target = await resolveMemberTarget(message, args);
  if (!target) {
    await message.reply(
      "Could not find that member. Use `!credits` for yourself or `!credits @user`.",
    );
    return;
  }

  const isSelf = target.id === message.author.id;
  const balance = await getOrCreateCredits(message.guildId, target.id);
  const creditsEmoji = await resolveEmojiById(
    message.guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );

  // Looking up someone else — balance only (no redeem shop).
  if (!isSelf) {
    const embed = new EmbedBuilder()
      .setColor(CREDITS_EMBED_COLOR)
      .setAuthor({
        name: `${target.displayName}'s Credits`,
        iconURL: target.displayAvatarURL({ size: 128 }),
      })
      .setDescription(
        `${target.displayName} currently has **${balance.toLocaleString("en-US")}** credits ${creditsEmoji}`,
      )
      .setFooter({ text: "Credits are separate from game points" })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
    return;
  }

  const [vipCrown, eliteCrown, supremeCrown] = await Promise.all([
    resolveEmojiById(message.guild, VIP_CROWN_EMOJI_ID, VIP_CROWN_EMOJI_NAME),
    resolveEmojiById(message.guild, ELITE_CROWN_EMOJI_ID, ELITE_CROWN_EMOJI_NAME),
    resolveEmojiById(
      message.guild,
      SUPREME_CROWN_EMOJI_ID,
      SUPREME_CROWN_EMOJI_NAME,
    ),
  ]);

  const tierEmoji: Record<string, string> = {
    vip_1m: vipCrown,
    elite_1m: eliteCrown,
    supreme_1m: supremeCrown,
  };

  const redeemLines = REDEEM_ITEMS.map((item) => {
    const itemEmoji =
      "emoji" in item ? item.emoji : (tierEmoji[item.id] ?? "👑");
    return `${itemEmoji} **${item.label}** ${item.duration}  |  **${item.cost.toLocaleString("en-US")}** ${creditsEmoji}`;
  });

  const embed = new EmbedBuilder()
    .setColor(CREDITS_EMBED_COLOR)
    .setAuthor({
      name: "Redeem Credits",
      iconURL: message.author.displayAvatarURL({ size: 128 }),
    })
    .setDescription(
      [
        `You have **${balance.toLocaleString("en-US")}** credits ${creditsEmoji}`,
        "",
        "🛒 __Redeem__",
        ...redeemLines,
        "",
        "_Pick an item below to spend your credits._",
      ].join("\n"),
    )
    .setFooter({ text: "Credits are separate from game points" })
    .setTimestamp();

  const select = new StringSelectMenuBuilder()
    .setCustomId(selectCustomId(message.author.id))
    .setPlaceholder("Make a selection")
    .addOptions(
      REDEEM_ITEMS.map((item) => ({
        label: `${item.label} ${item.duration}`,
        description: `${item.cost.toLocaleString("en-US")} credits`,
        value: item.id,
        emoji:
          "emoji" in item
            ? item.emoji
            : { id: item.emojiId, name: item.emojiName },
      })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    select,
  );

  await message.reply({ embeds: [embed], components: [row] });
}

function itemById(id: string) {
  return REDEEM_ITEMS.find((i) => i.id === id);
}

/**
 * Handle credits redeem select menu. Returns true if handled.
 */
export async function onCreditsRedeemInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isStringSelectMenu()) return false;
  if (!interaction.customId.startsWith(CREDITS_SELECT_PREFIX)) return false;
  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "Redeem only works in the server.",
      ephemeral: true,
    });
    return true;
  }

  const ownerId = interaction.customId.slice(CREDITS_SELECT_PREFIX.length);
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "This redeem menu isn't yours — run `!credits` to open your shop.",
      ephemeral: true,
    });
    return true;
  }

  const itemId = interaction.values[0] as RedeemItemId | undefined;
  const item = itemId ? itemById(itemId) : undefined;
  if (!item) {
    await interaction.reply({
      content: "Unknown shop item.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferReply({ ephemeral: true });

  const member = await interaction.guild.members
    .fetch(interaction.user.id)
    .catch(() => null);
  if (!member) {
    await interaction.editReply("Could not load your member profile.");
    return true;
  }

  const creditsEmoji = await resolveEmojiById(
    interaction.guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );

  let newBalance: number;
  try {
    newBalance = await spendCredits(
      interaction.guildId,
      interaction.user.id,
      item.cost,
    );
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      const bal = await getOrCreateCredits(
        interaction.guildId,
        interaction.user.id,
      );
      await interaction.editReply(
        `Not enough credits — **${item.label}** costs **${item.cost.toLocaleString("en-US")}** ${creditsEmoji}. You have **${bal.toLocaleString("en-US")}**.`,
      );
      return true;
    }
    console.error("[credits] spend failed:", err);
    await interaction.editReply("Couldn't spend credits right now. Try again.");
    return true;
  }

  try {
    let detail: string;
    if (item.id === "double_xp_1d") {
      const boost = await grantXpBooster(
        interaction.guildId,
        interaction.user.id,
      );
      const exp = Math.floor(new Date(boost.expiresAt).getTime() / 1000);
      detail = boost.blessActive
        ? `🧪 Extended your active bless boost by **1 hour** (**${boost.multiplier}× XP** until <t:${exp}:R>).`
        : `🧪 **Double XP** (**${boost.multiplier}×**) is active until <t:${exp}:R>.`;
    } else if (item.id === "vip_1m" || item.id === "elite_1m") {
      const kind: PaidRoleKind = item.id === "vip_1m" ? "vip" : "elite";
      const roleId = kind === "vip" ? ROLE_IDS.vip : ROLE_IDS.elite;
      if (!roleId) {
        await addCredits(
          interaction.guildId,
          interaction.user.id,
          item.cost,
        ).catch(() => {});
        await interaction.editReply(
          `${kind.toUpperCase()} role isn't configured — credits were refunded if possible.`,
        );
        return true;
      }
      const grant = await grantTimedPaidRole(member, kind);
      const exp = Math.floor(new Date(grant.expiresAt).getTime() / 1000);
      detail = `You now have <@&${roleId}> until <t:${exp}:R>.`;
      await announceDonation(member, kind).catch((err) =>
        console.error("[credits] donation announce failed:", err),
      );
    } else if (item.id === "supreme_1m") {
      if (!ROLE_IDS.supreme) {
        await addCredits(
          interaction.guildId,
          interaction.user.id,
          item.cost,
        ).catch(() => {});
        await interaction.editReply(
          "Supreme role isn't configured — credits were refunded if possible.",
        );
        return true;
      }
      const grant = await grantBotSupreme(member, {
        grantedBy: interaction.user.id,
      });
      const exp = grant.expiresAt
        ? Math.floor(new Date(grant.expiresAt).getTime() / 1000)
        : null;
      detail = exp
        ? `You now have <@&${ROLE_IDS.supreme}> until <t:${exp}:R>.`
        : `You now have <@&${ROLE_IDS.supreme}>.`;
      await announceDonation(member, "supreme").catch((err) =>
        console.error("[credits] donation announce failed:", err),
      );
    } else {
      detail = "Redeemed.";
    }

    await interaction.editReply(
      [
        `Purchased **${item.label}** for **${item.cost.toLocaleString("en-US")}** ${creditsEmoji}.`,
        detail,
        `Balance: **${newBalance.toLocaleString("en-US")}** ${creditsEmoji}`,
      ].join("\n"),
    );
  } catch (err) {
    console.error("[credits] grant after spend failed:", err);
    try {
      await addCredits(interaction.guildId, interaction.user.id, item.cost);
    } catch (refundErr) {
      console.error("[credits] refund failed:", refundErr);
    }
    await interaction.editReply(
      err instanceof Error
        ? `Purchase failed: ${err.message} Credits were refunded if possible.`
        : "Purchase failed. Credits were refunded if possible.",
    );
  }

  return true;
}
