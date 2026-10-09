import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { getTopByLevel } from "../services/xp.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

export async function handleLeaderboardCommand(
  message: Message<true>,
): Promise<void> {
  const top = await getTopByLevel(message.guildId, 10);

  if (top.length === 0) {
    await message.reply("No one has earned XP yet.");
    return;
  }

  const lines = await Promise.all(
    top.map(async (row, i) => {
      const rank = i + 1;
      let name = `<@${row.userId}>`;
      try {
        const member = await message.guild.members.fetch(row.userId);
        name = member.displayName;
      } catch {
        /* keep mention */
      }
      return ltrLine(
        `**${rank}.** **${ltrIsolate(name)}** — Level **${row.level}** · **${row.xp}** XP`,
      );
    }),
  );

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle("Level Leaderboard")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Top 10 · Highest level" });

  await message.reply({ embeds: [embed] });
}
