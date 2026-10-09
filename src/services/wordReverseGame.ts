import { EmbedBuilder, type Message, type TextChannel } from "discord.js";
import {
  announceCrateTypingWin,
  buildBackwardsConfirmEmbed,
  formatCrateTypingRewardText,
  formatCrateRarityLine,
  GAME_EMBED_COLOR,
  mysteriousCrateAuthor,
  rollCrateTypingReward,
  type CrateTypingReward,
} from "./crateTypingShared.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const DURATION_MS = 2 * 60_000;

const WORDS = [
  "PIXEL",
  "CRATE",
  "QUEST",
  "FLAME",
  "STORM",
  "GHOST",
  "OCEAN",
  "NIGHT",
  "SPARK",
  "CLOUD",
  "RIVER",
  "MAGIC",
  "BLAZE",
  "FROST",
  "LUCKY",
  "BRAVE",
  "HAPPY",
  "SMILE",
  "DREAM",
  "LIGHT",
  "SHADOW",
  "PLANET",
  "ROCKET",
  "GUITAR",
  "CASTLE",
  "DRAGON",
  "FOREST",
  "WINDOW",
  "PURPLE",
  "SILVER",
  "GARDEN",
  "ORANGE",
  "BANANA",
  "PUZZLE",
  "CIRCUS",
  "TURTLE",
  "MIRROR",
  "BRIDGE",
  "CANDLE",
  "BUTTON",
] as const;

type ActiveWordReverseRound = {
  channelId: string;
  messageId: string;
  word: string;
  answer: string;
  reward: CrateTypingReward;
  endsAtUnix: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveWordReverseRound>();

export function getActiveWordReverseRound(
  channelId: string,
): ActiveWordReverseRound | undefined {
  return rounds.get(channelId);
}

function reverseWord(word: string): string {
  return word.split("").reverse().join("");
}

function pickWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)]!;
}

async function buildEmbed(
  round: ActiveWordReverseRound,
  opts: { finished?: boolean; winnerId?: string | null } = {},
): Promise<EmbedBuilder> {
  const rewardText = await formatCrateTypingRewardText(
    round.channel,
    round.reward,
  );

  let header: string;
  if (opts.finished && opts.winnerId) {
    header = ltrLine(
      `✅ ${ltrIsolate(`<@${opts.winnerId}>`)} got it — **${round.answer}**`,
    );
  } else if (opts.finished) {
    header = `⏰ Time's up — the answer was **${round.answer}**.`;
  } else {
    header = "💬 **Type the word backwards in chat to win!**";
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor(mysteriousCrateAuthor(round.channel))
    .setDescription(
      [
        header,
        "",
        `✏️ **Word:** \`${round.word}\``,
        "👑 First correct answer wins!",
        `💡 Hint: **${round.word.length}** letters`,
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

async function finishWordReverseRound(
  round: ActiveWordReverseRound,
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
    console.warn("[wordRev] Failed to finalize message:", err);
  }

  if (opts.winnerMessage) {
    await announceCrateTypingWin({
      channel: round.channel,
      winnerMessage: opts.winnerMessage,
      reward: round.reward,
      confirmEmbed: buildBackwardsConfirmEmbed(round.word, round.answer),
    });
    console.log(
      `[wordRev] ${opts.winnerMessage.author.id} won ${round.reward.reward} ${round.reward.rewardKind} in ${round.channelId}`,
    );
  }
}

export async function startWordReverseRound(
  channel: TextChannel,
): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const word = pickWord();
  const answer = reverseWord(word);
  const reward = rollCrateTypingReward();

  const round: ActiveWordReverseRound = {
    channelId: channel.id,
    messageId: "",
    word,
    answer,
    reward,
    endsAtUnix: Math.floor((Date.now() + DURATION_MS) / 1000),
    ended: false,
    timeout: setTimeout(() => {
      void finishWordReverseRound(round);
    }, DURATION_MS),
    channel,
  };

  const sent = await channel.send({
    embeds: [await buildEmbed(round)],
  });
  round.messageId = sent.id;
  rounds.set(channel.id, round);

  console.log(
    `[wordRev] Started in ${channel.id} — ${word}→${answer} ${reward.rewardKind} ${reward.rarityLabel}`,
  );
  return true;
}

export async function tryWordReverseGuess(
  message: Message<true>,
): Promise<boolean> {
  const round = rounds.get(message.channel.id);
  if (!round || round.ended) return false;

  const guess = message.content.trim().replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{3,12}$/.test(guess)) return false;

  if (guess === round.answer) {
    await finishWordReverseRound(round, { winnerMessage: message });
    return true;
  }

  // Wrong — react and let them keep trying until time runs out or someone wins.
  await message.react("❌").catch(() => {});
  return true;
}
