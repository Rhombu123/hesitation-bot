import {
  EmbedBuilder,
  type Message,
  type MessageReaction,
  type PartialMessage,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import { config } from "../config.js";

const SOB_EMOJI = "😭";
const SOB_THRESHOLD = 5;

/** source message key → sob-board message id */
const posted = new Map<string, string>();

function sourceKey(guildId: string, messageId: string): string {
  return `${guildId}:${messageId}`;
}

function isSobEmoji(name: string | null): boolean {
  if (!name) return false;
  const n = [...name]
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp !== 0xfe0f && cp !== 0xfe0e;
    })
    .join("");
  return n === SOB_EMOJI || name === SOB_EMOJI || name === "sob";
}

async function countHumanSobReactors(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<number> {
  try {
    if (reaction.partial) await reaction.fetch();
  } catch {
    return 0;
  }
  try {
    const users = await reaction.users.fetch();
    return users.filter((u) => !u.bot).size;
  } catch {
    return reaction.count ?? 0;
  }
}

function buildSobEmbed(
  message: Message | PartialMessage,
  humanCount: number,
): EmbedBuilder {
  const author = message.author!;
  const content =
    message.content?.trim() ||
    message.embeds[0]?.description?.trim() ||
    "_No text_";

  const embed = new EmbedBuilder()
    .setColor(0x143b96)
    .setAuthor({
      name: author.displayName ?? author.username,
      iconURL: author.displayAvatarURL({ size: 64 }),
    })
    .setDescription(content.slice(0, 4000))
    .addFields({
      name: "Source",
      value: `[Jump to message](${message.url})`,
    })
    .setFooter({ text: `😭 ${humanCount}` })
    .setTimestamp(message.createdAt);

  const img =
    message.attachments.find((a) =>
      /\.(png|jpe?g|gif|webp)$/i.test(a.name ?? a.url),
    ) ?? null;
  if (img) embed.setImage(img.url);

  return embed;
}

/**
 * Quiet sob board: at 5+ 😭 reactions, post to the sob thread.
 * Further reactions update the footer to the live count.
 */
export async function onStarboardReaction(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser,
): Promise<boolean> {
  if (user.bot) return false;
  if (!isSobEmoji(reaction.emoji.name)) return false;

  try {
    if (reaction.partial) await reaction.fetch();
  } catch {
    return false;
  }

  const message = reaction.message;
  if (!message.guildId || message.channelId === config.sobboardThreadId) {
    return false;
  }

  try {
    if (message.partial) await message.fetch();
  } catch {
    return false;
  }

  if (!message.author) return false;

  const humanCount = await countHumanSobReactors(reaction);
  const key = sourceKey(message.guildId, message.id);
  const existingId = posted.get(key);

  // Already on the board — keep the count in sync (can go up or down).
  if (existingId) {
    if (humanCount < SOB_THRESHOLD) return true;
    const channel = await message.client.channels
      .fetch(config.sobboardThreadId)
      .catch(() => null);
    if (!channel || !channel.isTextBased() || !("messages" in channel)) {
      return true;
    }
    const boardMsg = await channel.messages.fetch(existingId).catch(() => null);
    if (!boardMsg) {
      posted.delete(key);
      // Fall through to re-post below if still at threshold.
    } else {
      await boardMsg
        .edit({ embeds: [buildSobEmbed(message, humanCount)] })
        .catch((err) => console.error("[sobboard] Failed to update:", err));
      return true;
    }
  }

  if (humanCount < SOB_THRESHOLD) return false;
  if (posted.has(key)) return true;

  const channel = await message.client.channels
    .fetch(config.sobboardThreadId)
    .catch(() => null);
  if (!channel || !channel.isTextBased() || !("send" in channel)) {
    console.warn(
      `[sobboard] Thread ${config.sobboardThreadId} missing or not sendable.`,
    );
    return false;
  }

  // Mark early to avoid double-posts from concurrent reactions.
  posted.set(key, "");

  try {
    const sent = await channel.send({
      embeds: [buildSobEmbed(message, humanCount)],
    });
    posted.set(key, sent.id);
  } catch (err) {
    console.error("[sobboard] Failed to post:", err);
    posted.delete(key);
  }

  return true;
}
