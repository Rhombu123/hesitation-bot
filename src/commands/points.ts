import path from "node:path";
import { fileURLToPath } from "node:url";
import { AttachmentBuilder, EmbedBuilder, type Message } from "discord.js";
import { POINTS_EMBED_COLOR, POINTS_EMOJI } from "../config.js";
import {
  getCurrencyRank,
  getOrCreateBalance,
} from "../services/currency.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";

const POINTS_THUMB_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/points-thumb.png",
);
const POINTS_THUMB_NAME = "points-thumb.png";

export async function handlePointsCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const target = await resolveMemberTarget(message, args);
  if (!target) {
    await message.reply(
      "Could not find that member. Use `!points` for yourself or `!points @user`.",
    );
    return;
  }

  const [balance, rank] = await Promise.all([
    getOrCreateBalance(message.guildId, target.id),
    getCurrencyRank(message.guildId, target.id),
  ]);

  const isSelf = target.id === message.author.id;
  const pointsLabel = balance === 1 ? "point" : "points";
  const haveLine = isSelf
    ? `You currently have **${balance} ${pointsLabel}** ${POINTS_EMOJI}`
    : `${target.displayName} currently has **${balance} ${pointsLabel}** ${POINTS_EMOJI}`;
  const rankLine = isSelf
    ? `You are ranked #${rank}`
    : `Ranked #${rank}`;

  const thumb = new AttachmentBuilder(POINTS_THUMB_PATH, {
    name: POINTS_THUMB_NAME,
  });

  const embed = new EmbedBuilder()
    .setColor(POINTS_EMBED_COLOR)
    .setAuthor({
      name: `${target.displayName}'s Points`,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setDescription(haveLine)
    .setThumbnail(`attachment://${POINTS_THUMB_NAME}`)
    .setFooter({ text: rankLine })
    .setTimestamp();

  await message.reply({ embeds: [embed], files: [thumb] });
}
