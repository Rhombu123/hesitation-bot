import { EmbedBuilder, type Message, type TextChannel } from "discord.js";
import { GAME_EMBED_COLOR, REP_UP_EMOJI } from "../config.js";
import {
  CRATE_RARITIES,
  pickCrateRarity,
  pickRepRarity,
  rollCrateCredits,
  rollRepReward,
  formatCrateRarityLine,
  type CrateRarity,
  REP_RARITIES,
} from "../config/creditRewards.js";
import { generateEmojiEquation } from "../data/emojiEquations.js";
import { randomInt } from "../utils/helpers.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { addCredits } from "./credits.js";
import { buildCrateWinMessage } from "./crateWin.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";
import { grantSystemReputation } from "./reputation.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const DURATION_MS = 60_000;

type RewardKind = "credits" | "rep";

type ActiveEmojiEqRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  lines: string[];
  solveEmoji: string;
  answer: number;
  rewardKind: RewardKind;
  rarityId: CrateRarity;
  rarityLabel: string;
  reward: number;
  endsAtUnix: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveEmojiEqRound>();

export function getActiveEmojiEqRound(
  channelId: string,
): ActiveEmojiEqRound | undefined {
  return rounds.get(channelId);
}

function parseNumberGuess(content: string): number | null {
  const trimmed = content.trim();
  if (!/^-?\d{1,4}$/.test(trimmed)) return null;
  return Number(trimmed);
}

async function formatReward(round: ActiveEmojiEqRound): Promise<string> {
  if (round.rewardKind === "rep") {
    return `${round.reward} Rep ${REP_UP_EMOJI}`;
  }
  const creditsEmoji = await resolveEmojiById(
    round.channel.guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );
  return `${round.reward} Credits ${creditsEmoji}`;
}

async function buildEmbed(
  round: ActiveEmojiEqRound,
  opts: { finished?: boolean; winnerId?: string | null } = {},
): Promise<EmbedBuilder> {
  const iconURL = round.channel.client.user?.displayAvatarURL({ size: 128 });
  const rewardText = await formatReward(round);

  let header: string;
  if (opts.finished && opts.winnerId) {
    header = ltrLine(
      `✅ ${ltrIsolate(`<@${opts.winnerId}>`)} solved it — **${round.solveEmoji} = ${round.answer}**`,
    );
  } else if (opts.finished) {
    header = `⏰ Time's up — ${round.solveEmoji} was **${round.answer}**.`;
  } else {
    header = "💬 Solve the __emoji equation__ in chat to win!";
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor({
      name: "A Mysterious Crate Has Appeared!",
      ...(iconURL ? { iconURL } : {}),
    })
    .setDescription(
      [
        header,
        "",
        round.lines.join("\n"),
        "",
        `🧩 **Solve For:** ${round.solveEmoji}`,
        "📝 First correct answer wins!",
        "💡 Hint: Type only the number",
        "",
        formatCrateRarityLine(round.rarityId, round.rarityLabel),
        `🎁 **Reward:** ${rewardText}`,
        `📅 **Expires:** <t:${round.endsAtUnix}:R>`,
      ].join("\n"),
    );
}

async function awardReward(
  round: ActiveEmojiEqRound,
  userId: string,
): Promise<void> {
  if (round.rewardKind === "rep") {
    try {
      await grantSystemReputation({
        guildId: round.guildId,
        userId,
        amount: round.reward,
        source: "emoji-eq",
      });
    } catch (err) {
      console.error("[emojiEq] Rep award failed:", err);
    }
  } else {
    try {
      await addCredits(round.guildId, userId, round.reward);
    } catch (err) {
      console.error("[emojiEq] Credit award failed:", err);
    }
  }
}

async function announceWinner(
  round: ActiveEmojiEqRound,
  winnerId: string,
): Promise<void> {
  const member = await round.channel.guild.members
    .fetch(winnerId)
    .catch(() => null);
  const user =
    member?.user ??
    (await round.channel.client.users.fetch(winnerId).catch(() => null));
  if (!user) return;

  const win = await buildCrateWinMessage({
    guild: round.channel.guild,
    guildId: round.guildId,
    winner: member ?? user,
    amount: round.reward,
    kind: round.rewardKind,
    rarityLabel: round.rarityLabel,
  });

  await round.channel
    .send(win)
    .catch((err) => console.warn("[emojiEq] Failed to send congrats:", err));

  if (member) {
    await tryAnnounceLootDrop(round.channel, member).catch((err) =>
      console.error("[emojiEq] loot drop failed:", err),
    );
  }
}

async function finishEmojiEqRound(
  round: ActiveEmojiEqRound,
  opts: { winnerId?: string } = {},
): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  clearTimeout(round.timeout);
  rounds.delete(round.channelId);

  try {
    const msg = await round.channel.messages.fetch(round.messageId);
    await msg.edit({
      embeds: [
        await buildEmbed(round, {
          finished: true,
          winnerId: opts.winnerId ?? null,
        }),
      ],
    });
  } catch (err) {
    console.warn("[emojiEq] Failed to finalize message:", err);
  }

  if (opts.winnerId) {
    await awardReward(round, opts.winnerId);
    await announceWinner(round, opts.winnerId);
    console.log(
      `[emojiEq] ${opts.winnerId} won ${round.reward} ${round.rewardKind} in ${round.channelId}`,
    );
  }
}

export async function startEmojiEqRound(
  channel: TextChannel,
): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const puzzle = generateEmojiEquation();
  const rewardKind: RewardKind = randomInt(0, 1) === 0 ? "rep" : "credits";
  const rarity =
    rewardKind === "rep" ? pickRepRarity() : pickCrateRarity();
  const reward =
    rewardKind === "rep"
      ? rollRepReward(
          REP_RARITIES.find((r) => r.id === rarity.id) ?? REP_RARITIES[0]!,
        )
      : rollCrateCredits(
          CRATE_RARITIES.find((r) => r.id === rarity.id) ?? CRATE_RARITIES[0]!,
        );

  const round: ActiveEmojiEqRound = {
    channelId: channel.id,
    guildId: channel.guild.id,
    messageId: "",
    lines: puzzle.lines,
    solveEmoji: puzzle.solveEmoji,
    answer: puzzle.answer,
    rewardKind,
    rarityId: rarity.id,
    rarityLabel: rarity.label,
    reward,
    endsAtUnix: Math.floor((Date.now() + DURATION_MS) / 1000),
    ended: false,
    timeout: setTimeout(() => {
      void finishEmojiEqRound(round);
    }, DURATION_MS),
    channel,
  };

  const sent = await channel.send({
    embeds: [await buildEmbed(round)],
  });
  round.messageId = sent.id;
  rounds.set(channel.id, round);

  console.log(
    `[emojiEq] Started in ${channel.id} — ${puzzle.solveEmoji}=${puzzle.answer} ${rewardKind} ${rarity.label}`,
  );
  return true;
}

/**
 * Number-only chat guesses. Unlimited tries until someone wins or time runs out.
 * Returns true if the message was consumed as a guess (correct or wrong).
 */
export async function tryEmojiEqGuess(
  message: Message<true>,
): Promise<boolean> {
  const round = rounds.get(message.channel.id);
  if (!round || round.ended) return false;

  const guess = parseNumberGuess(message.content);
  if (guess === null) return false;

  if (guess === round.answer) {
    await finishEmojiEqRound(round, { winnerId: message.author.id });
    return true;
  }

  await message.react("❌").catch(() => {});
  return true;
}
