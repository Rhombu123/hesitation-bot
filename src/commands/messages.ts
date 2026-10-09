import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { getDailyCount } from "../services/dailyMessages.js";
import { getOrCreateStats } from "../services/xp.js";
import { DAILY_RESET_TZ, dailyDateString } from "../utils/helpers.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";

export async function handleMessagesCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const target = await resolveMemberTarget(message, args);
  if (!target) {
    await message.reply("Could not find that member.");
    return;
  }

  const [stats, todayCount] = await Promise.all([
    getOrCreateStats(message.guildId, target.id),
    getDailyCount(message.guildId, target.id),
  ]);

  const date = dailyDateString();
  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: `${target.displayName}'s Messages`,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `**Today:** **${todayCount}**`,
        `**All time:** **${stats.totalMessages}**`,
      ].join("\n"),
    )
    .setFooter({
      text: `Daily count resets at midnight (${DAILY_RESET_TZ}) · ${date}`,
    });

  await message.reply({ embeds: [embed] });
}
