import { EmbedBuilder, type Message, type TextChannel } from "discord.js";
import {
  announceCrateTypingWin,
  formatCrateTypingRewardText,
  formatCrateRarityLine,
  GAME_EMBED_COLOR,
  mysteriousCrateAuthor,
  rollCrateTypingReward,
  type CrateTypingReward,
} from "./crateTypingShared.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const DURATION_MS = 60_000;

/** Exact phrases players must type as shown. */
const STATEMENTS = [
  "lara is the best owner",
  "hesitation is the vibe",
  "welcome to the lounge",
  "stay kind in chat",
  "good vibes only here",
  "type carefully and win",
  "community over chaos",
  "make new friends today",
  "sfw and social always",
  "drop a game and play",
  "respect the chat rules",
  "have fun and be nice",
  "first exact answer wins",
  "mystery crate unlocked soon",
  "play fair and stay cool",
] as const;

type ActiveStateRound = {
  channelId: string;
  messageId: string;
  statement: string;
  reward: CrateTypingReward;
  endsAtUnix: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveStateRound>();

export function getActiveStateRound(
  channelId: string,
): ActiveStateRound | undefined {
  return rounds.get(channelId);
}

function pickStatement(): string {
  return STATEMENTS[Math.floor(Math.random() * STATEMENTS.length)]!;
}

async function buildEmbed(
  round: ActiveStateRound,
  opts: { finished?: boolean; winnerId?: string | null } = {},
): Promise<EmbedBuilder> {
  const rewardText = await formatCrateTypingRewardText(
    round.channel,
    round.reward,
  );

  let header: string;
  if (opts.finished && opts.winnerId) {
    header = ltrLine(
      `✅ ${ltrIsolate(`<@${opts.winnerId}>`)} typed it correctly!`,
    );
  } else if (opts.finished) {
    header = "⏰ Time's up — nobody typed the statement in time.";
  } else {
    header = "💬 **Type the word exactly as shown in chat to win!**";
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor(mysteriousCrateAuthor(round.channel))
    .setDescription(
      [
        header,
        "",
        `✏️ **Word:** \`${round.statement}\``,
        "🏆 First exact answer wins!",
        "",
        formatCrateRarityLine(
          round.reward.rarityId,
          round.reward.rarityLabel,
        ),
        `🎁 **Reward:** ${rewardText}`,
        `📅 **Expires:** <t:${round.endsAtUnix}:R>`,
      ].join("\n"),
    );
}

async function finishStateRound(
  round: ActiveStateRound,
  opts: { winnerMessage?: Message<true> } = {},
): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  clearTimeout(round.timeout);
  rounds.delete(round.channelId);

  const winnerId = opts.winnerMessage?.author.id;

  try {
    const msg = await round.channel.messages.fetch(round.messageId);
    await msg.edit({
      embeds: [
        await buildEmbed(round, {
          finished: true,
          winnerId: winnerId ?? null,
        }),
      ],
    });
  } catch (err) {
    console.warn("[stateGame] Failed to finalize message:", err);
  }

  if (opts.winnerMessage) {
    await announceCrateTypingWin({
      channel: round.channel,
      winnerMessage: opts.winnerMessage,
      reward: round.reward,
    });
    console.log(
      `[stateGame] ${opts.winnerMessage.author.id} won ${round.reward.reward} ${round.reward.rewardKind} in ${round.channelId}`,
    );
  }
}

export async function startStateRound(channel: TextChannel): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const statement = pickStatement();
  const reward = rollCrateTypingReward();

  const round: ActiveStateRound = {
    channelId: channel.id,
    messageId: "",
    statement,
    reward,
    endsAtUnix: Math.floor((Date.now() + DURATION_MS) / 1000),
    ended: false,
    timeout: setTimeout(() => {
      void finishStateRound(round);
    }, DURATION_MS),
    channel,
  };

  const sent = await channel.send({
    embeds: [await buildEmbed(round)],
  });
  round.messageId = sent.id;
  rounds.set(channel.id, round);

  console.log(
    `[stateGame] Started in ${channel.id} — "${statement}" ${reward.rewardKind} ${reward.rarityLabel}`,
  );
  return true;
}

/** Exact match (trimmed) against the shown statement. Unlimited tries. */
export async function tryStateGuess(message: Message<true>): Promise<boolean> {
  const round = rounds.get(message.channel.id);
  if (!round || round.ended) return false;

  const guess = message.content.trim();
  if (!guess) return false;

  // Only treat as a guess if it looks like an attempt (similar length / starts alike).
  const target = round.statement;
  const closeEnough =
    guess === target ||
    Math.abs(guess.length - target.length) <= 8 ||
    guess.toLowerCase().startsWith(target.slice(0, 6).toLowerCase());
  if (!closeEnough) return false;

  if (guess === target) {
    await finishStateRound(round, { winnerMessage: message });
    return true;
  }

  await message.react("❌").catch(() => {});
  return true;
}
