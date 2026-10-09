import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type GuildMember,
  type Interaction,
  type TextChannel,
} from "discord.js";
import { randomInt } from "../utils/helpers.js";
import { grantSystemReputation } from "./reputation.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";
import {
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import {
  placeholderAvatar,
  renderVoteCard,
  type VoteCardOptions,
} from "./voteImage.js";

import { GAME_EMBED_COLOR } from "../config.js";
const VOTE_DURATION_MS = 45_000;
const REP_REWARD = 5;
const CARD_NAME = "vote-vs.png";

type Contestant = {
  userId: string;
  displayName: string;
  avatarUrl: string;
  votes: number;
};

type ActiveVoteRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  left: Contestant;
  right: Contestant;
  /** userId → side they voted for */
  ballots: Map<string, "left" | "right">;
  endsAtUnix: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  pendingEdit: ReturnType<typeof setTimeout> | null;
  leftAvatar: Buffer;
  rightAvatar: Buffer;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveVoteRound>();

export function getActiveVoteRound(
  channelId: string,
): ActiveVoteRound | undefined {
  return rounds.get(channelId);
}

function buttonLabel(name: string): string {
  const prefix = "Vote for ";
  const room = 70 - prefix.length;
  const trimmed =
    name.length > room ? `${name.slice(0, Math.max(1, room - 1))}…` : name;
  return `${prefix}${trimmed}`;
}

function voteButtons(
  left: Contestant,
  right: Contestant,
  disabled = false,
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("vote:left")
      .setLabel(buttonLabel(left.displayName))
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId("vote:right")
      .setLabel(buttonLabel(right.displayName))
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
  );
}

function percents(leftVotes: number, rightVotes: number): [number, number] {
  const total = leftVotes + rightVotes;
  if (total === 0) return [0, 0];
  const left = Math.round((leftVotes / total) * 100);
  return [left, 100 - left];
}

async function buildEmbed(opts: {
  channel: TextChannel;
  endsAtUnix: number;
  finished?: boolean;
  /** True when the poll ended with equal votes — no rep awarded. */
  tied?: boolean;
  winnerName?: string;
  margin?: number;
}): Promise<EmbedBuilder> {
  const iconURL = opts.channel.client.user?.displayAvatarURL({ size: 128 });
  const crown = await resolveEmojiById(
    opts.channel.guild,
    CROWN_EMOJI_ID,
    CROWN_EMOJI_NAME,
  );

  let description: string;
  let footer: string;
  if (opts.finished && opts.tied) {
    description = "🤝 **It's a tie!** Nobody gains rep this round.";
    footer = "Check your rep using !rep";
  } else if (opts.finished && opts.winnerName) {
    const by =
      opts.margin != null && opts.margin > 0
        ? ` by **${opts.margin} vote${opts.margin === 1 ? "" : "s"}**`
        : "";
    description = `${crown} **${opts.winnerName}** won the poll${by} and gained **+${REP_REWARD} rep!**`;
    footer = "Check your rep using !rep";
  } else {
    description = [
      "🎲 **Two random chatters have been selected**",
      `${crown} The **winner** will be picked <t:${opts.endsAtUnix}:R>`,
    ].join("\n");
    footer = `The winner will receive +${REP_REWARD} rep`;
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor({
      name: "Who Deserves More Rep?",
      ...(iconURL ? { iconURL } : {}),
    })
    .setDescription(description)
    .setImage(`attachment://${CARD_NAME}`)
    .setFooter({ text: footer });
}

async function fetchAvatarBuffer(
  url: string,
  fallbackColor: string,
): Promise<Buffer> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return placeholderAvatar(fallbackColor);
  }
}

async function buildCardAttachment(
  round: ActiveVoteRound,
  cardOpts: VoteCardOptions = {},
): Promise<AttachmentBuilder> {
  const [leftPct, rightPct] = percents(round.left.votes, round.right.votes);
  const png = await renderVoteCard(
    {
      name: round.left.displayName,
      votes: round.left.votes,
      percent: leftPct,
      avatarPng: round.leftAvatar,
    },
    {
      name: round.right.displayName,
      votes: round.right.votes,
      percent: rightPct,
      avatarPng: round.rightAvatar,
    },
    cardOpts,
  );
  return new AttachmentBuilder(png, { name: CARD_NAME });
}

function pickTwoIds(ids: string[]): [string, string] | null {
  if (ids.length < 2) return null;
  const pool = [...ids];
  const a = pool.splice(randomInt(0, pool.length - 1), 1)[0]!;
  const b = pool[randomInt(0, pool.length - 1)]!;
  return [a, b];
}

async function resolveContestant(
  channel: TextChannel,
  userId: string,
): Promise<Contestant | null> {
  let member: GuildMember | null =
    channel.guild.members.cache.get(userId) ?? null;
  if (!member) {
    member = await channel.guild.members.fetch(userId).catch(() => null);
  }
  if (!member || member.user.bot) return null;
  return {
    userId,
    displayName: member.displayName,
    avatarUrl: member.displayAvatarURL({ extension: "png", size: 512 }),
    votes: 0,
  };
}

function scheduleCardRefresh(round: ActiveVoteRound): void {
  if (round.pendingEdit || round.ended) return;
  round.pendingEdit = setTimeout(() => {
    round.pendingEdit = null;
    void (async () => {
      if (round.ended) return;
      try {
        const msg = await round.channel.messages.fetch(round.messageId);
        const card = await buildCardAttachment(round);
        await msg.edit({
          embeds: [
            await buildEmbed({
              channel: round.channel,
              endsAtUnix: round.endsAtUnix,
            }),
          ],
          components: [voteButtons(round.left, round.right)],
          attachments: [],
          files: [card],
        });
      } catch (err) {
        console.warn("[voteGame] Failed to refresh vote card:", err);
      }
    })();
  }, 600);
}

async function finishVoteRound(round: ActiveVoteRound): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  if (round.pendingEdit) {
    clearTimeout(round.pendingEdit);
    round.pendingEdit = null;
  }
  clearTimeout(round.timeout);
  rounds.delete(round.channelId);

  const leftVotes = round.left.votes;
  const rightVotes = round.right.votes;
  const tied = leftVotes === rightVotes;

  let winnerSide: "left" | "right" | undefined;
  if (!tied) {
    winnerSide = leftVotes > rightVotes ? "left" : "right";
  }

  const winner = winnerSide ? round[winnerSide] : null;
  const margin = Math.abs(leftVotes - rightVotes);

  if (winner) {
    try {
      await grantSystemReputation({
        guildId: round.guildId,
        userId: winner.userId,
        amount: REP_REWARD,
        source: "vote-machine",
      });
    } catch (err) {
      console.error("[voteGame] Failed to grant rep:", err);
    }

    const winnerMember = await round.channel.guild.members
      .fetch(winner.userId)
      .catch(() => null);
    if (winnerMember) {
      await tryAnnounceLootDrop(round.channel, winnerMember).catch((err) =>
        console.error("[voteGame] loot drop failed:", err),
      );
    }
  }

  try {
    const msg = await round.channel.messages.fetch(round.messageId);
    const cardOpts = winnerSide ? { winner: winnerSide } : {};
    const card = await buildCardAttachment(round, cardOpts);

    const finishedEmbed = await buildEmbed({
      channel: round.channel,
      endsAtUnix: round.endsAtUnix,
      finished: true,
      tied,
      winnerName: winner?.displayName,
      margin,
    });

    await msg.edit({
      embeds: [finishedEmbed],
      components: [voteButtons(round.left, round.right, true)],
      attachments: [],
      files: [card],
    });

    const winCard = await buildCardAttachment(round, cardOpts);
    await round.channel.send({
      content: winner ? `<@${winner.userId}>` : undefined,
      embeds: [finishedEmbed],
      files: [winCard],
      reply: {
        messageReference: round.messageId,
        failIfNotExists: false,
      },
      allowedMentions: winner
        ? { users: [winner.userId] }
        : { parse: [] },
    });
  } catch (err) {
    console.warn("[voteGame] Failed to finalize / announce winner:", err);
  }
}

/**
 * Start a vote round between two users drawn from `candidateIds` (active chatters).
 * Expects a pool of about 3–5 people; picks 2 at random.
 */
export async function startVoteRound(
  channel: TextChannel,
  candidateIds: string[],
): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const unique = [...new Set(candidateIds)].filter(Boolean);
  const pool = unique.slice(0, 5);
  if (pool.length < 2) return false;

  let left: Contestant | null = null;
  let right: Contestant | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const picked = pickTwoIds(pool);
    if (!picked) return false;
    const [a, b] = await Promise.all([
      resolveContestant(channel, picked[0]),
      resolveContestant(channel, picked[1]),
    ]);
    if (a && b && a.userId !== b.userId) {
      left = a;
      right = b;
      break;
    }
  }
  if (!left || !right) return false;

  const [leftAvatar, rightAvatar] = await Promise.all([
    fetchAvatarBuffer(left.avatarUrl, "#3b82f6"),
    fetchAvatarBuffer(right.avatarUrl, "#ec4899"),
  ]);

  const endsAtUnix = Math.floor((Date.now() + VOTE_DURATION_MS) / 1000);

  const round: ActiveVoteRound = {
    channelId: channel.id,
    guildId: channel.guildId,
    messageId: "",
    left,
    right,
    ballots: new Map(),
    endsAtUnix,
    ended: false,
    timeout: setTimeout(() => {}, VOTE_DURATION_MS),
    pendingEdit: null,
    leftAvatar,
    rightAvatar,
    channel,
  };
  clearTimeout(round.timeout);

  const card = await buildCardAttachment(round);
  const sent = await channel.send({
    embeds: [await buildEmbed({ channel, endsAtUnix })],
    components: [voteButtons(left, right)],
    files: [card],
  });

  round.messageId = sent.id;
  round.timeout = setTimeout(() => {
    void finishVoteRound(round);
  }, VOTE_DURATION_MS);

  rounds.set(channel.id, round);

  console.log(
    `[voteGame] Round in ${channel.id}: ${left.displayName} vs ${right.displayName}`,
  );
  return true;
}

export async function onVoteGameInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (
    interaction.customId !== "vote:left" &&
    interaction.customId !== "vote:right"
  ) {
    return false;
  }

  const side = interaction.customId === "vote:left" ? "left" : "right";
  const round = rounds.get(interaction.channelId);
  if (!round || round.ended) {
    await interaction.reply({
      content: "This vote has ended.",
      ephemeral: true,
    });
    return true;
  }

  const prev = round.ballots.get(interaction.user.id);
  if (prev) {
    await interaction.reply({
      content:
        prev === side
          ? "You already voted for them."
          : `You already voted for **${round[prev].displayName}**. Votes can't be switched.`,
      ephemeral: true,
    });
    return true;
  }

  round.ballots.set(interaction.user.id, side);
  round[side].votes += 1;

  await interaction.reply({
    content: `✅ Vote cast for **${round[side].displayName}**.`,
    ephemeral: true,
  });

  scheduleCardRefresh(round);
  return true;
}
