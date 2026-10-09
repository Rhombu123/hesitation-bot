import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Client,
  type GuildMember,
  type Interaction,
  type User,
} from "discord.js";
import { EMBED_COLOR, config, emoji, POINTS_EMOJI } from "../config.js";
import { rollCreditsForLevelUps, CRATE_RARITY_EMOJI_IDS } from "../config/creditRewards.js";
import { milestonesReached } from "../config/milestones.js";
import { addCredits } from "./credits.js";
import {
  getLevelNotifyPrefs,
} from "./levelNotify.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  INFO_EMOJI_ID,
  INFO_EMOJI_NAME,
  UP_EMOJI_ID,
  resolveEmojiById,
} from "../utils/customEmojis.js";

const ROLE_GAIN_COLOR = 0x143b96;
const FEATURE_COLOR = 0x143b96;
const LEVEL_GAIN_COLOR = 0x143b96;

export type GrantedLevelRole = {
  level: number;
  roleName: string;
  roleId: string;
};

function levelUpButtons(guildId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`levelup:progress:${guildId}`)
      .setLabel("Progress")
      .setEmoji("🚀")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`levelup:credits:${guildId}`)
      .setLabel("Credits")
      .setEmoji({ id: CRATE_RARITY_EMOJI_IDS.epic })
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`levelup:points:${guildId}`)
      .setLabel("Points")
      .setEmoji({ id: "1533274681694490735" })
      .setStyle(ButtonStyle.Secondary),
  );
}

async function dmLevelUpPackage(
  user: User,
  opts: {
    guildId: string;
    guildName: string;
    levelsGained: number;
    newLevel: number;
    oldLevel: number;
    creditReward: number;
    grantedRoles: GrantedLevelRole[];
    avatarUrl?: string;
    info: string;
    up: string;
    creditsEmoji: string;
    chat: string;
    xpOrb: string;
  },
): Promise<void> {
  const embeds: EmbedBuilder[] = [];

  for (const g of opts.grantedRoles) {
    embeds.push(
      new EmbedBuilder()
        .setColor(ROLE_GAIN_COLOR)
        .setAuthor({
          name: "New Role Gained",
          ...(opts.avatarUrl ? { iconURL: opts.avatarUrl } : {}),
        })
        .setDescription(
          `You've been given the **${g.roleName}** role`,
        )
        .setFooter({ text: "Use !level to check your progress" }),
    );
  }

  for (const m of milestonesReached(opts.oldLevel, opts.newLevel)) {
    embeds.push(
      new EmbedBuilder()
        .setColor(FEATURE_COLOR)
        .setAuthor({
          name: "New Feature Unlocked",
          ...(opts.avatarUrl ? { iconURL: opts.avatarUrl } : {}),
        })
        .setDescription(m.unlock)
        .setFooter({ text: "Use !level to check your progress" }),
    );
  }

  const levelLines = [
    `${opts.info} You **__leveled__** up **${opts.levelsGained}** ${opts.up} to **Level ${opts.newLevel}!**`,
  ];
  if (opts.creditReward > 0) {
    levelLines.push(
      "",
      "🎁 **Reward**",
      `➖ ${opts.creditsEmoji} **${opts.creditReward.toLocaleString("en-US")} credits**`,
    );
  }
  levelLines.push(
    "",
    `${opts.chat} Stay **__active__** in **__chat or calls__** to keep earning **XP** ${opts.xpOrb}`,
  );

  embeds.push(
    new EmbedBuilder()
      .setColor(LEVEL_GAIN_COLOR)
      .setAuthor({
        name: "New Level Gained!",
        ...(opts.avatarUrl ? { iconURL: opts.avatarUrl } : {}),
      })
      .setDescription(levelLines.join("\n"))
      .setFooter({ text: opts.guildName }),
  );
  if (opts.avatarUrl) {
    embeds[embeds.length - 1]!.setThumbnail(opts.avatarUrl);
  }

  try {
    const dm = await user.createDM();
    await dm.send({
      embeds,
      components: [levelUpButtons(opts.guildId)],
    });
  } catch (err) {
    console.warn(
      `[levelUp] Could not DM ${user.id} level-up package:`,
      err,
    );
  }
}

export async function announceLevelUp(
  client: Client,
  opts: {
    guildId: string;
    userId: string;
    levelsGained: number;
    newLevel: number;
    /** Level before this XP grant (needed for per-level credit rolls). */
    oldLevel: number;
    member?: GuildMember | null;
    grantedRoles?: GrantedLevelRole[];
  },
): Promise<void> {
  const channelId = config.levelUpChannelId;
  const grantedRoles = opts.grantedRoles ?? [];

  try {
    const guild = await client.guilds.fetch(opts.guildId).catch(() => null);
    if (guild) {
      await guild.emojis.fetch().catch((err) =>
        console.warn("[levelUp] Could not refresh guild emojis:", err),
      );
    }

    const member =
      opts.member ??
      (await guild?.members.fetch(opts.userId).catch(() => null)) ??
      null;
    const user =
      member?.user ?? (await client.users.fetch(opts.userId).catch(() => null));
    const avatarUrl = (member ?? user)?.displayAvatarURL({ size: 256 });

    const info = await resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME);
    const up = await resolveEmojiById(guild, UP_EMOJI_ID, "up");
    const creditsEmoji = await resolveEmojiById(
      guild,
      CREDITS_EMOJI_ID,
      CREDITS_EMOJI_NAME,
    );
    const chat = emoji("chat", "💬");
    const xpOrb = emoji("xp", "🫧");

    const creditReward = rollCreditsForLevelUps(opts.oldLevel, opts.newLevel);
    if (creditReward > 0) {
      try {
        await addCredits(opts.guildId, opts.userId, creditReward);
      } catch (err) {
        console.error("[levelUp] Credit reward failed:", err);
      }
    }

    // DM package (role / feature / level embeds) — optional per user prefs.
    const prefs = await getLevelNotifyPrefs(opts.guildId, opts.userId);
    if (user && prefs.dmEnabled) {
      await dmLevelUpPackage(user, {
        guildId: opts.guildId,
        guildName: guild?.name ?? "the server",
        levelsGained: opts.levelsGained,
        newLevel: opts.newLevel,
        oldLevel: opts.oldLevel,
        creditReward,
        grantedRoles,
        avatarUrl,
        info,
        up,
        creditsEmoji,
        chat,
        xpOrb,
      });
    }

    if (!channelId) return;
    if (!prefs.serverEnabled) return;

    const channel = await client.channels.fetch(channelId);
    if (!channel?.isSendable() || channel.isDMBased()) {
      console.warn(
        `[levelUp] Channel ${channelId} is missing or not a sendable guild channel — skipping public announcement.`,
      );
      return;
    }

    // Never cross-post another guild's level-ups into that channel.
    if (!("guildId" in channel) || channel.guildId !== opts.guildId) {
      console.log(
        `[levelUp] Skipping public announce for guild ${opts.guildId} → level ${opts.newLevel} (channel belongs to ${"guildId" in channel ? channel.guildId : "n/a"}).`,
      );
      return;
    }

    const lines = [
      `${info} You **__leveled__** up **${opts.levelsGained}** ${up} to **Level ${opts.newLevel}!**`,
    ];
    if (creditReward > 0) {
      lines.push(
        "",
        "🎁 **Reward**",
        `➖ ${creditsEmoji} **${creditReward.toLocaleString("en-US")} credits**`,
      );
    }
    lines.push(
      "",
      `${chat} Stay **__active__** in **__chat or calls__** to keep earning **XP** ${xpOrb}`,
    );

    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({ name: "New Level Gained!", iconURL: avatarUrl })
      .setDescription(lines.join("\n"));
    if (avatarUrl) embed.setThumbnail(avatarUrl);

    await channel.send({
      content: `<@${opts.userId}>`,
      embeds: [embed],
    });
  } catch (err) {
    console.error(
      `[levelUp] Failed to announce level ${opts.newLevel} for user ${opts.userId}:`,
      err,
    );
  }
}

/** Handle Progress / Credits / Points buttons from level-up DMs. */
export async function onLevelUpDmInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("levelup:")) return false;

  const [, action, guildId] = interaction.customId.split(":");
  if (!action || !guildId) return true;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (action === "progress") {
      const { getOrCreateStats } = await import("./xp.js");
      const { progressInLevel } = await import("../utils/levelFormula.js");
      const stats = await getOrCreateStats(guildId, interaction.user.id);
      const { level, current, needed } = progressInLevel(stats.xp);
      const remaining = Math.max(0, needed - current);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle("Your Progress")
            .setDescription(
              [
                `**Level ${level}**`,
                `**${current}** / **${needed}** XP`,
                `**${remaining}** XP to next · **${stats.xp}** total`,
                "",
                `Use \`!level\` in <#${config.levelCommandChannelId}> for full milestones.`,
              ].join("\n"),
            ),
        ],
      });
      return true;
    }

    if (action === "credits") {
      const { getOrCreateCredits } = await import("./credits.js");
      const balance = await getOrCreateCredits(guildId, interaction.user.id);
      await interaction.editReply({
        content: `You have **${balance.toLocaleString("en-US")}** credits. Use \`!credits\` in <#${config.levelCommandChannelId}> to redeem.`,
      });
      return true;
    }

    if (action === "points") {
      const { getOrCreateBalance } = await import("./currency.js");
      const balance = await getOrCreateBalance(guildId, interaction.user.id);
      await interaction.editReply({
        content: `You have **${balance.toLocaleString("en-US")}** ${POINTS_EMOJI}. Use \`!points\` to check anytime.`,
      });
      return true;
    }
  } catch (err) {
    console.error("[levelUp] DM button failed:", err);
    await interaction.editReply("Couldn't load that right now.").catch(() => {});
  }

  return true;
}
