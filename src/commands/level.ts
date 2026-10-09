import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Interaction,
  type Message,
} from "discord.js";
import { EMBED_COLOR, config, emoji } from "../config.js";
import { LEVEL_MILESTONES } from "../config/milestones.js";
import {
  getLevelNotifyPrefs,
  setLevelNotifyPref,
} from "../services/levelNotify.js";
import { getOrCreateStats } from "../services/xp.js";
import { progressInLevel } from "../utils/levelFormula.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";
import { isStaffMember } from "../utils/staff.js";

function notifyButtons(
  guildId: string,
  prefs: { serverEnabled: boolean; dmEnabled: boolean },
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(
        `lvlnotify:server:${prefs.serverEnabled ? "off" : "on"}:${guildId}`,
      )
      .setLabel("Server Notifications")
      .setStyle(
        prefs.serverEnabled ? ButtonStyle.Success : ButtonStyle.Danger,
      ),
    new ButtonBuilder()
      .setCustomId(
        `lvlnotify:dm:${prefs.dmEnabled ? "off" : "on"}:${guildId}`,
      )
      .setLabel("DM Notifications")
      .setStyle(prefs.dmEnabled ? ButtonStyle.Success : ButtonStyle.Danger),
  );
}

export async function handleLevelCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const author =
    message.member ??
    (await message.guild.members
      .fetch({ user: message.author.id, force: true })
      .catch(() => null));

  const staffBypass = author ? isStaffMember(author) : false;
  if (!staffBypass && message.channelId !== config.levelCommandChannelId) {
    await message.reply(
      `Use \`!level\` in <#${config.levelCommandChannelId}> only.`,
    );
    return;
  }

  const target = await resolveMemberTarget(message, args);
  if (!target) {
    await message.reply("Could not find that member.");
    return;
  }

  const stats = await getOrCreateStats(message.guildId, target.id);
  const { level, current, needed } = progressInLevel(stats.xp);
  const remaining = Math.max(0, needed - current);
  const xpIcon = emoji("xp", "🫧");

  const milestones = LEVEL_MILESTONES.map((m) => {
    const done = level >= m.level;
    const mark = done ? "✅" : "❌";
    return `${mark} **Level ${m.level}:** ${m.reward}`;
  }).join("\n");

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: "Progress Overview",
      iconURL: target.displayAvatarURL({ size: 128 }),
    })
    .setThumbnail(target.displayAvatarURL({ size: 256 }))
    .setDescription(
      [
        `**${target.displayName}** · Level **${level}** ${xpIcon}`,
        `**${current}** / **${needed}** XP`,
        `**${remaining}** XP to next level · **${stats.xp}** total XP`,
        "",
        "**Milestones**",
        milestones,
      ].join("\n"),
    )
    .setFooter({
      text: "Keep up the activity in VC/Chat to gain XP and unlock new milestones!",
    });

  const isSelf = target.id === message.author.id;
  if (!isSelf) {
    await message.reply({ embeds: [embed] });
    return;
  }

  const prefs = await getLevelNotifyPrefs(message.guildId, target.id);
  await message.reply({
    embeds: [embed],
    components: [notifyButtons(message.guildId, prefs)],
  });
}

/** Toggle server / DM level-up notifications from `!level` buttons. */
export async function onLevelNotifyInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("lvlnotify:")) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({
      content: "Use this in a server.",
      ephemeral: true,
    });
    return true;
  }

  const parts = interaction.customId.split(":");
  // lvlnotify:server|dm:on|off:guildId
  const channel = parts[1];
  const mode = parts[2];
  const guildId = parts[3];
  if (
    (channel !== "server" && channel !== "dm") ||
    (mode !== "on" && mode !== "off") ||
    !guildId
  ) {
    return true;
  }

  if (guildId !== interaction.guildId) {
    await interaction.reply({
      content: "These buttons are for a different server.",
      ephemeral: true,
    });
    return true;
  }

  await interaction.deferUpdate();

  const enabled = mode === "on";
  const prefs = await setLevelNotifyPref(guildId, interaction.user.id, {
    ...(channel === "server"
      ? { serverEnabled: enabled }
      : { dmEnabled: enabled }),
  });

  const embed = interaction.message.embeds[0]
    ? EmbedBuilder.from(interaction.message.embeds[0])
    : new EmbedBuilder().setColor(EMBED_COLOR).setDescription("Progress Overview");

  await interaction.editReply({
    embeds: [embed],
    components: [notifyButtons(guildId, prefs)],
  });

  const label =
    channel === "server" ? "Server level-up messages" : "DM level-up messages";
  await interaction.followUp({
    content: `${label}: **${enabled ? "enabled" : "disabled"}**.`,
    ephemeral: true,
  });

  return true;
}
