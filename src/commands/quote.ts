import {
  AttachmentBuilder,
  type Message,
} from "discord.js";
import { QUOTE_ROLE_IDS } from "../config.js";
import {
  hasElite,
  hasMythic,
  hasSupreme,
  hasVip,
  isServerBooster,
} from "../config/rolePrivileges.js";
import { getOrCreateStats } from "../services/xp.js";
import { renderQuoteCard } from "../services/quoteImage.js";
import { isStaffMember } from "../utils/staff.js";

const QUOTE_MIN_LEVEL = 20;

async function canUseQuotes(message: Message<true>): Promise<boolean> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return false;
  if (isStaffMember(member)) return true;
  if (member.roles.cache.some((role) => QUOTE_ROLE_IDS.has(role.id))) {
    return true;
  }
  if (isServerBooster(member)) return true;
  if (
    hasVip(member) ||
    hasElite(member) ||
    hasSupreme(member) ||
    hasMythic(member)
  ) {
    return true;
  }
  const stats = await getOrCreateStats(message.guildId, message.author.id);
  return stats.level >= QUOTE_MIN_LEVEL;
}

export async function handleQuoteCommand(
  message: Message<true>,
): Promise<void> {
  if (!(await canUseQuotes(message))) {
    await message.reply(
      "Quotes are for **server boosters**, **level 20+**, **VIP / Elite / Supreme**, or members with a quote role.",
    );
    return;
  }

  if (!message.reference?.messageId) {
    await message.reply(
      "Reply to a message (yours or someone else’s) with `!quote` to turn it into a quote card.",
    );
    return;
  }

  const target = await message.channel.messages
    .fetch(message.reference.messageId)
    .catch(() => null);
  if (!target) {
    await message.reply("Couldn’t find that message.");
    return;
  }

  const text = target.content?.trim() || target.embeds[0]?.description?.trim();
  if (!text) {
    await message.reply(
      "That message has no text to quote (images-only aren’t supported yet).",
    );
    return;
  }

  // Self-quotes are allowed — quote your own messages the same way.
  const author = target.author;
  const isSelf = author.id === message.author.id;
  const member = await message.guild.members.fetch(author.id).catch(() => null);
  const displayName = member?.displayName ?? author.displayName ?? author.username;
  const avatarUrl = author.displayAvatarURL({
    extension: "png",
    size: 512,
    forceStatic: true,
  });

  let png: Buffer;
  try {
    png = await renderQuoteCard({
      quoteText: text,
      displayName,
      username: author.username,
      avatarUrl,
      watermark: message.client.user?.tag ?? "Hesitant",
    });
  } catch (err) {
    console.error("[quote] render failed:", err);
    await message.reply("Couldn’t render that quote. Try again.");
    return;
  }

  const file = new AttachmentBuilder(png, { name: "quote.png" });
  const jump = target.url;
  const content = isSelf
    ? `<@${message.author.id}> quoted themselves\n[Jump to original message](${jump})`
    : `<@${message.author.id}> quoted <@${author.id}>\n[Jump to original message](${jump})`;

  await message.reply({
    content,
    files: [file],
    allowedMentions: {
      users: [...new Set([message.author.id, author.id])],
    },
  });
}
