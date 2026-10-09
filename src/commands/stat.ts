import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { ACTIONS } from "../config/actions.js";
import { getActionStatsMap } from "../services/actionStats.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";

export async function handleStatCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const target = await resolveMemberTarget(message, args);
  if (!target) {
    await message.reply("Could not find that member.");
    return;
  }

  const counts = await getActionStatsMap(message.guildId, target.id);
  const lines = [...ACTIONS]
    .map((action) => ({
      action,
      n: counts.get(action.name) ?? 0,
    }))
    .sort((a, b) => b.n - a.n || a.action.label.localeCompare(b.action.label))
    .map(
      ({ action, n }) => `${action.emoji} **${action.label}** — **${n}**`,
    );

  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: `${target.displayName}'s Action Stats`,
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Total received · ${total}` });

  await message.reply({ embeds: [embed] });
}
