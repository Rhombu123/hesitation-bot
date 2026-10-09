import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type Message,
} from "discord.js";
import { config, REP_DOWN_EMOJI, REP_UP_EMOJI } from "../config.js";
import { UP_EMOJI_ID, resolveEmojiById } from "../utils/customEmojis.js";
import {
  getDailyRepLimit,
  getRepGiveAmount,
} from "../config/rolePrivileges.js";
import { getOrCreateStats } from "../services/xp.js";
import {
  applyReputation,
  formatWaitDuration,
  getReputationLog,
  getReputationSnapshot,
  getRepsLeftToday,
  getSameTargetRepCooldown,
  isRepImmune,
  msUntilNextUtcMidnight,
} from "../services/reputation.js";
import { randomInt } from "../utils/helpers.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";

const REP_GREEN = 0x143b96;
const REP_RED = 0x143b96;
const REP_ORANGE = 0x143b96;

/** Purple star thumbnail for `!rep` / `.rep` embeds. */
const REP_STAR_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/rep-star.png",
);
const REP_STAR_NAME = "rep-star.png";

type PendingRep = {
  guildId: string;
  fromUserId: string;
  toUserIds: string[];
  /** Absolute amount to apply per target (always positive); sign via `positive`. */
  amount: number;
  positive: boolean;
  channelId: string;
  expiresAt: number;
};

const pending = new Map<string, PendingRep>();
const PENDING_TTL_MS = 60_000;

function sweepPending(now = Date.now()): void {
  for (const [id, p] of pending) {
    if (p.expiresAt <= now) pending.delete(id);
  }
}

function makePendingId(): string {
  return `${Date.now().toString(36)}${randomInt(1000, 9999)}`;
}

function formatMentionList(ids: string[]): string {
  const mentions = ids.map((id) => `<@${id}>`);
  if (mentions.length === 1) return mentions[0]!;
  if (mentions.length === 2) return `${mentions[0]} and ${mentions[1]}`;
  return `${mentions.slice(0, -1).join(", ")}, and ${mentions[mentions.length - 1]}`;
}

async function resolveMemberByToken(
  guild: Guild,
  token: string,
): Promise<GuildMember | null> {
  const cleaned = token.replace(/^<@!?|>$/g, "").replace(/^@/, "").trim();
  if (!cleaned) return null;

  if (/^\d{15,21}$/.test(cleaned)) {
    return guild.members.fetch(cleaned).catch(() => null);
  }

  const needle = cleaned.toLowerCase();
  const fromCache = guild.members.cache.find((m) => {
    if (m.user.username.toLowerCase() === needle) return true;
    if (m.displayName.toLowerCase() === needle) return true;
    if (m.user.globalName?.toLowerCase() === needle) return true;
    const tag = `${m.user.username}#${m.user.discriminator}`.toLowerCase();
    if (m.user.discriminator !== "0" && tag === needle) return true;
    return false;
  });
  if (fromCache) return fromCache;

  const searched = await guild.members
    .search({ query: cleaned, limit: 10 })
    .catch(() => null);
  if (!searched || searched.size === 0) return null;

  const exact = searched.find((m) => {
    if (m.user.username.toLowerCase() === needle) return true;
    if (m.displayName.toLowerCase() === needle) return true;
    if (m.user.globalName?.toLowerCase() === needle) return true;
    return false;
  });
  return exact ?? searched.first() ?? null;
}

/**
 * Resolve one or more +rep/−rep targets from mentions, IDs, usernames, or a reply.
 */
async function resolveRepTargets(
  message: Message<true>,
  rest: string,
): Promise<{ ids: string[] } | { error: string }> {
  const tokens = rest.trim().split(/\s+/).filter(Boolean);
  const ids: string[] = [];
  const seen = new Set<string>();

  const pushMember = (
    member: GuildMember,
  ): { error: string } | null => {
    if (isRepImmune(member.id)) {
      return {
        error: `<@${member.id}> cannot receive reputation.`,
      };
    }
    if (member.user.bot) return { error: "You can't give reputation to bots." };
    if (member.id === message.author.id) {
      return { error: "You can't give reputation to yourself." };
    }
    if (seen.has(member.id)) return null;
    seen.add(member.id);
    ids.push(member.id);
    return null;
  };

  if (tokens.length > 0) {
    for (const token of tokens) {
      const member = await resolveMemberByToken(message.guild, token);
      if (!member) {
        return {
          error: `Could not find member \`${token.replace(/`/g, "")}\`. Use a mention, username, or ID.`,
        };
      }
      const err = pushMember(member);
      if (err) return err;
    }
    return { ids };
  }

  const replyUser = message.reference?.messageId
    ? await message.channel.messages
        .fetch(message.reference.messageId)
        .then((m) => m.author)
        .catch(() => null)
    : null;

  if (replyUser) {
    if (isRepImmune(replyUser.id)) {
      return { error: `<@${replyUser.id}> cannot receive reputation.` };
    }
    if (replyUser.bot) return { error: "You can't give reputation to bots." };
    if (replyUser.id === message.author.id) {
      return { error: "You can't give reputation to yourself." };
    }
    return { ids: [replyUser.id] };
  }

  return {
    error:
      "Who should get the rep? Reply to their message or use `+rep @user` / username / ID (you can list several).",
  };
}

function outOfRepsEmbed(dailyLimit: number): EmbedBuilder {
  const wait = formatWaitDuration(msUntilNextUtcMidnight());
  return new EmbedBuilder()
    .setColor(REP_RED)
    .setDescription(
      [
        `🚫 **You ran out of reputation points [${dailyLimit} daily]**`,
        `Please wait ${wait} before trying again`,
      ].join("\n"),
    );
}

function notEnoughRepsEmbed(left: number, tried: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(REP_RED)
    .setDescription(
      [
        `🚫 **Not enough reps left today**`,
        `You have **${left}** left, but tried to give to **${tried}** user${tried === 1 ? "" : "s"}.`,
      ].join("\n"),
    );
}

function sameTargetCooldownEmbed(retryInMs: number): EmbedBuilder {
  const wait = formatWaitDuration(retryInMs);
  return new EmbedBuilder()
    .setColor(REP_RED)
    .setDescription(
      [
        "🚫 **You already gave reputation to that user in the last 24 hours**",
        `Please wait ${wait} before trying again`,
      ].join("\n"),
    );
}

async function resolveGiverRepLimit(
  message: Message<true>,
): Promise<{ limit: number; left: number }> {
  const member =
    message.member ??
    (await message.guild.members
      .fetch({ user: message.author.id, force: true })
      .catch(() => null));
  const stats = await getOrCreateStats(message.guildId, message.author.id);
  const limit = member
    ? getDailyRepLimit(member, stats.level)
    : config.repDailyLimit;
  const left = await getRepsLeftToday(
    message.guildId,
    message.author.id,
    limit,
  );
  return { limit, left };
}

/**
 * Handle bare `+rep` / `-rep` (optional @user, username, ID, or reply; multi OK).
 * Returns true if the message was a rep give command.
 */
export async function tryHandleGiveRep(
  message: Message<true>,
): Promise<boolean> {
  const content = message.content.trim();
  const match = content.match(/^([+\-])rep(?:utation)?(?:\s+(.*))?$/i);
  if (!match) return false;

  const positive = match[1] === "+";
  const rest = match[2] ?? "";

  const { limit, left } = await resolveGiverRepLimit(message);
  if (left <= 0) {
    await message.reply({ embeds: [outOfRepsEmbed(limit)] });
    return true;
  }

  const targets = await resolveRepTargets(message, rest);
  if ("error" in targets) {
    await message.reply(targets.error);
    return true;
  }

  if (targets.ids.length > left) {
    await message.reply({
      embeds: [notEnoughRepsEmbed(left, targets.ids.length)],
    });
    return true;
  }

  for (const toUserId of targets.ids) {
    const sameTarget = await getSameTargetRepCooldown(
      message.guildId,
      message.author.id,
      toUserId,
    );
    if (sameTarget.blocked) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(REP_RED)
            .setDescription(
              [
                `🚫 **You already gave reputation to <@${toUserId}> in the last 24 hours**`,
                `Please wait ${formatWaitDuration(sameTarget.retryInMs)} before trying again`,
              ].join("\n"),
            ),
        ],
      });
      return true;
    }
  }

  const giver =
    message.member ??
    (await message.guild.members
      .fetch({ user: message.author.id, force: true })
      .catch(() => null));
  const giverStats = await getOrCreateStats(message.guildId, message.author.id);
  const amount = giver
    ? getRepGiveAmount(giver, positive, giverStats.level)
    : 1;

  sweepPending();
  const id = makePendingId();
  pending.set(id, {
    guildId: message.guildId,
    fromUserId: message.author.id,
    toUserIds: targets.ids,
    amount,
    positive,
    channelId: message.channelId,
    expiresAt: Date.now() + PENDING_TTL_MS,
  });

  const kind = positive ? "positive" : "negative";
  const color = positive ? REP_GREEN : REP_ORANGE;
  const list = formatMentionList(targets.ids);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rep:confirm:${id}`)
      .setLabel("Confirm")
      .setStyle(ButtonStyle.Success)
      .setEmoji("✅"),
    new ButtonBuilder()
      .setCustomId(`rep:cancel:${id}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("❌"),
  );

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setTitle("Confirmation Required")
        .setDescription(
          `Are you sure you want to give **${amount}** ${kind} rep to:\n${list}?`,
        ),
    ],
    components: [row],
  });

  return true;
}

export async function handleRepCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  // `!rep` / `.rep` → yourself; `!rep @user` / `.rep @user` → that member
  const target = await resolveMemberTarget(message, args);
  if (!target) {
    await message.reply(
      "Could not find that member. Use `!rep` for yourself or `!rep @user`.",
    );
    return;
  }

  const targetId = target.id;
  const targetName = target.displayName;
  const avatar = target.displayAvatarURL({ size: 128 });
  const isSelf = targetId === message.author.id;
  const possessive = isSelf ? "You have" : `**${targetName}** has`;
  const boardUrl = `https://discord.com/channels/${message.guildId}/${config.popularLeaderboardChannelId}`;
  const star = new AttachmentBuilder(REP_STAR_PATH, { name: REP_STAR_NAME });

  const loading = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: `${targetName}'s Reputation`,
      iconURL: avatar,
    })
    .setThumbnail(`attachment://${REP_STAR_NAME}`)
    .setDescription("Loading reputation…");

  const sent = await message.reply({ embeds: [loading], files: [star] });

  const [snap, up] = await Promise.all([
    getReputationSnapshot(message.guildId, targetId),
    resolveEmojiById(message.guild, UP_EMOJI_ID, "up"),
  ]);
  const score = snap.stats.score;
  const rank = snap.rank;
  const arrow = score < 0 ? REP_DOWN_EMOJI : up;

  const scoreLine = `${arrow} ${possessive} \`${score.toLocaleString("en-US")}\` Reputation`;
  const rankLabel = rank === null ? null : `[#${rank.rank}](${boardUrl})`;
  const rankLine =
    rank === null
      ? "📊 Not ranked yet"
      : rank.kind === "positive"
        ? `📊 Ranked ${rankLabel} for most positive rep`
        : `📊 Ranked ${rankLabel} for most negative rep`;

  const embed = new EmbedBuilder()
    .setColor(score < 0 ? 0xed4245 : 0x57f287)
    .setAuthor({
      name: `${targetName}'s Reputation`,
      iconURL: avatar,
    })
    .setThumbnail(`attachment://${REP_STAR_NAME}`)
    .setDescription(
      [scoreLine, rankLine, "", "Use +rep or -rep @user to give reputation"].join(
        "\n",
      ),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rep:log:${targetId}`)
      .setLabel("Reputation Log")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("⚙️"),
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel("Leaderboard")
      .setEmoji("🏆")
      .setURL(boardUrl),
  );

  await sent.edit({ embeds: [embed], components: [row] });
}

export async function onReputationInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("rep:")) return false;

  const [, action, payload] = interaction.customId.split(":");
  if (!action || !payload) return true;

  if (action === "log") {
    await showRepLog(interaction, payload);
    return true;
  }

  if (action === "confirm" || action === "cancel") {
    await handleConfirmCancel(interaction, action, payload);
    return true;
  }

  return true;
}

async function showRepLog(
  interaction: ButtonInteraction,
  userId: string,
): Promise<void> {
  const guildId = interaction.guildId!;
  const entries = await getReputationLog(guildId, userId, 15);

  if (entries.length === 0) {
    await interaction.reply({
      content: "No reputation history yet.",
      ephemeral: true,
    });
    return;
  }

  const lines = entries.map((e) => {
    const sign = e.amount > 0 ? "+" : "";
    const when = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`;
    return `${sign}**${e.amount}** from <@${e.fromUserId}> · ${when}`;
  });

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(REP_GREEN)
        .setTitle("Reputation Log")
        .setDescription(lines.join("\n"))
        .setFooter({ text: `Last ${entries.length} received` }),
    ],
    ephemeral: true,
  });
}

async function handleConfirmCancel(
  interaction: ButtonInteraction,
  action: string,
  pendingId: string,
): Promise<void> {
  sweepPending();
  const entry = pending.get(pendingId);

  if (!entry) {
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(REP_RED)
          .setDescription("This confirmation expired. Run `+rep` / `-rep` again."),
      ],
      components: [],
    });
    return;
  }

  if (interaction.user.id !== entry.fromUserId) {
    await interaction.reply({
      content: "Only the person who started this can confirm or cancel.",
      ephemeral: true,
    });
    return;
  }

  if (action === "cancel") {
    pending.delete(pendingId);
    await interaction.update({
      embeds: [
        new EmbedBuilder()
          .setColor(REP_RED)
          .setDescription("Cancelled — no reputation was given."),
      ],
      components: [],
    });
    return;
  }

  const guild = interaction.guild!;
  const giver =
    (await guild.members.fetch(entry.fromUserId).catch(() => null)) ?? null;
  const giverStats = await getOrCreateStats(entry.guildId, entry.fromUserId);
  const dailyLimit = giver
    ? getDailyRepLimit(giver, giverStats.level)
    : config.repDailyLimit;
  const left = await getRepsLeftToday(
    entry.guildId,
    entry.fromUserId,
    dailyLimit,
  );
  if (left < entry.toUserIds.length) {
    pending.delete(pendingId);
    await interaction.update({
      embeds:
        left <= 0
          ? [outOfRepsEmbed(dailyLimit)]
          : [notEnoughRepsEmbed(left, entry.toUserIds.length)],
      components: [],
    });
    return;
  }

  for (const toUserId of entry.toUserIds) {
    const sameTarget = await getSameTargetRepCooldown(
      entry.guildId,
      entry.fromUserId,
      toUserId,
    );
    if (sameTarget.blocked) {
      pending.delete(pendingId);
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(REP_RED)
            .setDescription(
              [
                `🚫 **You already gave reputation to <@${toUserId}> in the last 24 hours**`,
                `Please wait ${formatWaitDuration(sameTarget.retryInMs)} before trying again`,
              ].join("\n"),
            ),
        ],
        components: [],
      });
      return;
    }
  }

  pending.delete(pendingId);
  const delta = entry.positive ? entry.amount : -entry.amount;
  for (const toUserId of entry.toUserIds) {
    await applyReputation({
      guildId: entry.guildId,
      fromUserId: entry.fromUserId,
      toUserId,
      delta,
    });
  }

  const repsLeft = await getRepsLeftToday(
    entry.guildId,
    entry.fromUserId,
    dailyLimit,
  );
  const color = entry.positive ? REP_GREEN : REP_RED;
  const arrow = entry.positive ? REP_UP_EMOJI : REP_DOWN_EMOJI;
  const kind = entry.positive ? "positive" : "negative";
  const list = formatMentionList(entry.toUserIds);

  let authorIcon: string | undefined;
  try {
    const giverUser = await interaction.client.users.fetch(entry.fromUserId);
    authorIcon = giverUser.displayAvatarURL({ size: 128 });
  } catch {
    /* keep unset */
  }

  const multi = entry.toUserIds.length > 1;
  const description = multi
    ? `${arrow} <@${entry.fromUserId}> gave **${entry.amount}** ${kind} rep to:\n${list}`
    : `${arrow} You were given **${entry.amount}** ${kind} rep from <@${entry.fromUserId}>`;

  await interaction.update({
    embeds: [
      new EmbedBuilder()
        .setColor(color)
        .setAuthor({
          name: "New Reputation",
          ...(authorIcon ? { iconURL: authorIcon } : {}),
        })
        .setDescription(description)
        .setFooter({
          text: `Use .rep to check your reputation | You have ${repsLeft} rep${repsLeft === 1 ? "" : "s"} left today`,
        }),
    ],
    components: [],
    content: entry.toUserIds.map((id) => `<@${id}>`).join(" "),
    allowedMentions: { users: entry.toUserIds },
  });
}
