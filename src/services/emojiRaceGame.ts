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

const EMOJIS = [
  "🥵",
  "😎",
  "🔥",
  "💀",
  "✨",
  "🎯",
  "🍀",
  "⚡",
  "🌟",
  "💎",
  "🎮",
  "🍕",
  "🚀",
  "🌈",
  "👑",
  "💫",
  "🦊",
  "🐸",
  "🌸",
  "🧊",
  "🎵",
  "🧿",
  "🦋",
  "🌙",
] as const;

type ActiveEmojiRaceRound = {
  channelId: string;
  messageId: string;
  emoji: string;
  reward: CrateTypingReward;
  endsAtUnix: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveEmojiRaceRound>();

export function getActiveEmojiRaceRound(
  channelId: string,
): ActiveEmojiRaceRound | undefined {
  return rounds.get(channelId);
}

function pickEmoji(): string {
  return EMOJIS[Math.floor(Math.random() * EMOJIS.length)]!;
}

function normalizeEmojiContent(content: string): string {
  return content.trim().replace(/\uFE0F/g, "");
}

async function buildEmbed(
  round: ActiveEmojiRaceRound,
  opts: { finished?: boolean; winnerId?: string | null } = {},
): Promise<EmbedBuilder> {
  const rewardText = await formatCrateTypingRewardText(
    round.channel,
    round.reward,
  );

  let header: string;
  if (opts.finished && opts.winnerId) {
    header = ltrLine(
      `✅ ${ltrIsolate(`<@${opts.winnerId}>`)} sent ${round.emoji} first!`,
    );
  } else if (opts.finished) {
    header = `⏰ Time's up — nobody sent ${round.emoji} in time.`;
  } else {
    header = "💬 **Type** the emoji shown below in chat to win!";
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor(mysteriousCrateAuthor(round.channel))
    .setDescription(
      [
        header,
        "",
        `ℹ️ **Emoji:** ${round.emoji}`,
        "🏆 First exact emoji wins!",
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

async function finishEmojiRaceRound(
  round: ActiveEmojiRaceRound,
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
    console.warn("[emojiRace] Failed to finalize message:", err);
  }

  if (opts.winnerMessage) {
    await announceCrateTypingWin({
      channel: round.channel,
      winnerMessage: opts.winnerMessage,
      reward: round.reward,
    });
    console.log(
      `[emojiRace] ${opts.winnerMessage.author.id} won ${round.reward.reward} ${round.reward.rewardKind} in ${round.channelId}`,
    );
  }
}

export async function startEmojiRaceRound(
  channel: TextChannel,
): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const emoji = pickEmoji();
  const reward = rollCrateTypingReward();

  const round: ActiveEmojiRaceRound = {
    channelId: channel.id,
    messageId: "",
    emoji,
    reward,
    endsAtUnix: Math.floor((Date.now() + DURATION_MS) / 1000),
    ended: false,
    timeout: setTimeout(() => {
      void finishEmojiRaceRound(round);
    }, DURATION_MS),
    channel,
  };

  const sent = await channel.send({
    embeds: [await buildEmbed(round)],
  });
  round.messageId = sent.id;
  rounds.set(channel.id, round);

  console.log(
    `[emojiRace] Started in ${channel.id} — ${emoji} ${reward.rewardKind} ${reward.rarityLabel}`,
  );
  return true;
}

/** First message that is exactly the target emoji wins (race, no wrong-try lock). */
export async function tryEmojiRaceGuess(
  message: Message<true>,
): Promise<boolean> {
  const round = rounds.get(message.channel.id);
  if (!round || round.ended) return false;

  const content = normalizeEmojiContent(message.content);
  const target = normalizeEmojiContent(round.emoji);
  if (content !== target) return false;

  await finishEmojiRaceRound(round, { winnerMessage: message });
  return true;
}
