import {
  EmbedBuilder,
  type Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type TextChannel,
  type User,
} from "discord.js";
import { GAME_EMBED_COLOR } from "../config.js";
import {
  MOUSE_EMOJI_ID,
  MOUSE_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { randomInt } from "../utils/helpers.js";
import { buildGameWinPayload } from "./gameWin.js";

const REACT_TIMEOUT_MS = 45_000;
const DELAY_MIN_MS = 2_000;
const DELAY_MAX_MS = 5_000;

const REACT_EMOJIS = [
  "🔥",
  "💎",
  "🎯",
  "🍀",
  "🎈",
  "🎮",
  "💜",
  "🧡",
  "🤍",
  "🖤",
  "🌙",
  "⭐",
  "⚡",
  "☀️",
] as const;

type ActiveReactRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  /** Normalized emoji (no variation selectors). */
  emoji: string | null;
  armed: boolean;
  ended: boolean;
  delayTimer: ReturnType<typeof setTimeout>;
  endTimer: ReturnType<typeof setTimeout>;
};

const rounds = new Map<string, ActiveReactRound>();

/** Normalize unicode emoji for reliable matching (strip FE0F etc.). */
function normEmoji(raw: string | null | undefined): string {
  if (!raw) return "";
  return [...raw]
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp !== 0xfe0f && cp !== 0xfe0e && cp !== 0x200d;
    })
    .join("");
}

function emojiMatches(
  reactedName: string | null | undefined,
  targetNorm: string,
): boolean {
  const reacted = normEmoji(reactedName);
  if (!reacted || !targetNorm) return false;
  return reacted === targetNorm;
}

export function getActiveReactRound(
  channelId: string,
): ActiveReactRound | undefined {
  return rounds.get(channelId);
}

function clearRound(channelId: string): void {
  const round = rounds.get(channelId);
  if (!round) return;
  clearTimeout(round.delayTimer);
  clearTimeout(round.endTimer);
  rounds.delete(channelId);
}

async function removeUserReaction(
  reaction: MessageReaction | PartialMessageReaction,
  userId: string,
): Promise<void> {
  try {
    if (reaction.partial) await reaction.fetch().catch(() => null);
    await reaction.users.remove(userId);
  } catch (err) {
    console.warn("[reactGame] Failed to remove reaction:", err);
  }
}

/** Strip every non-bot reaction currently on the game message. */
async function clearHumanReactions(msg: Message): Promise<void> {
  for (const reaction of msg.reactions.cache.values()) {
    const users = await reaction.users.fetch().catch(() => null);
    if (!users) continue;
    for (const u of users.values()) {
      if (u.bot) continue;
      await reaction.users.remove(u.id).catch(() => null);
    }
  }
}

/**
 * First to React — post embed, wait a few seconds, react with a random emoji;
 * first matching human reaction on that embed wins a point.
 */
export async function startReactRound(
  channel: TextChannel,
): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const cursor = await resolveEmojiById(
    channel.guild,
    MOUSE_EMOJI_ID,
    MOUSE_EMOJI_NAME,
  );

  const embed = new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle(`${cursor} First to React`)
    .setDescription("First to react to this message wins!")
    .setFooter({ text: "Earn a point for winning" })
    .setTimestamp();

  const sent = await channel.send({ embeds: [embed] });
  const delayMs = randomInt(DELAY_MIN_MS, DELAY_MAX_MS);

  const delayTimer = setTimeout(() => {
    void armReactRound(channel, sent.id).catch((err) =>
      console.error("[reactGame] Arm failed:", err),
    );
  }, delayMs);

  const endTimer = setTimeout(() => {
    void expireReactRound(channel, sent.id).catch((err) =>
      console.error("[reactGame] Expire failed:", err),
    );
  }, delayMs + REACT_TIMEOUT_MS);

  rounds.set(channel.id, {
    channelId: channel.id,
    guildId: channel.guildId,
    messageId: sent.id,
    emoji: null,
    armed: false,
    ended: false,
    delayTimer,
    endTimer,
  });

  return true;
}

async function armReactRound(
  channel: TextChannel,
  messageId: string,
): Promise<void> {
  const round = rounds.get(channel.id);
  if (!round || round.messageId !== messageId || round.ended) return;

  const emoji = REACT_EMOJIS[randomInt(0, REACT_EMOJIS.length - 1)]!;
  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (!msg) {
    clearRound(channel.id);
    return;
  }

  // Wipe any premature human reactions before the real emoji appears.
  await clearHumanReactions(msg);

  try {
    await msg.react(emoji);
  } catch (err) {
    console.warn("[reactGame] Could not add emoji:", err);
    clearRound(channel.id);
    return;
  }

  // Arm only after the bot emoji is on the message.
  round.emoji = normEmoji(emoji);
  round.armed = true;
}

async function expireReactRound(
  channel: TextChannel,
  messageId: string,
): Promise<void> {
  const round = rounds.get(channel.id);
  if (!round || round.messageId !== messageId || round.ended) return;
  round.ended = true;
  clearRound(channel.id);

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) {
    const embed = EmbedBuilder.from(msg.embeds[0] ?? new EmbedBuilder())
      .setDescription("Nobody reacted in time — round over.")
      .setFooter({ text: "Try again next round" });
    await msg.edit({ embeds: [embed] }).catch(() => null);
  }
}

async function declareWinner(
  round: ActiveReactRound,
  userId: string,
  channel: Message["channel"],
): Promise<boolean> {
  if (round.ended) return false;
  round.ended = true;
  clearTimeout(round.delayTimer);
  clearTimeout(round.endTimer);
  rounds.delete(round.channelId);

  const guildId = round.guildId;

  try {
    const guild =
      channel && "guild" in channel ? channel.guild : undefined;
    const win = await buildGameWinPayload({
      guildId,
      userId,
      guild: guild ?? undefined,
      channel: channel && channel.isTextBased() ? channel : null,
      member: guild
        ? await guild.members.fetch(userId).catch(() => null)
        : null,
    });
    if (channel && channel.isTextBased() && "send" in channel) {
      await channel.send(win);
    }
    return true;
  } catch (err) {
    console.error("[reactGame] Win message failed:", err);
    return true;
  }
}

/**
 * Handle reactions on the First to React embed.
 * Any premature / wrong user reaction is removed so the board stays clean.
 */
export async function onReactGameReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<boolean> {
  if (user.bot) return false;

  const messageId = reaction.message.id;
  const channelId = reaction.message.channelId;
  if (!channelId || !messageId) return false;

  const round = rounds.get(channelId);
  if (!round || round.ended) return false;
  if (messageId !== round.messageId) return false;

  // Not armed yet — nobody may react; strip immediately.
  if (!round.armed || !round.emoji) {
    await removeUserReaction(reaction, user.id);
    return true;
  }

  let emojiName = reaction.emoji.name;
  if (!emojiName) {
    try {
      if (reaction.partial) await reaction.fetch();
      emojiName = reaction.emoji.name;
    } catch {
      await removeUserReaction(reaction, user.id);
      return true;
    }
  }

  // Wrong emoji — strip it so only the bot's target stays visible.
  if (!emojiMatches(emojiName, round.emoji)) {
    await removeUserReaction(reaction, user.id);
    return true;
  }

  return declareWinner(round, user.id, reaction.message.channel);
}
