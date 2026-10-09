import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Guild,
  type Interaction,
  type Message,
} from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { ACTIONS, getAction, type ActionDef } from "../config/actions.js";
import { getTopByAction } from "../services/actionStats.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const PREFIX = "actlb";

function wrapIndex(i: number): number {
  const n = ACTIONS.length;
  return ((i % n) + n) % n;
}

function navRow(index: number): ActionRowBuilder<ButtonBuilder> {
  const i = wrapIndex(index);
  const total = ACTIONS.length;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:prev:${i}`)
      .setEmoji("◀️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:page:${i}`)
      .setLabel(`${i + 1} / ${total}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:next:${i}`)
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function resolveDisplayName(
  guild: Guild,
  userId: string,
): Promise<string> {
  try {
    const member = await guild.members.fetch(userId);
    return member.displayName;
  } catch {
    return `<@${userId}>`;
  }
}

async function buildEmbed(
  guild: Guild,
  action: ActionDef,
): Promise<EmbedBuilder> {
  const top = await getTopByAction(guild.id, action.name, 10);
  const title = `Most ${action.noun}`;

  if (top.length === 0) {
    return new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setTitle(`${action.emoji} ${title}`)
      .setDescription(`No one has received any **${action.noun}** yet.`)
      .setFooter({ text: "Top 10 · Most received" });
  }

  const lines = await Promise.all(
    top.map(async (row, i) => {
      const name = await resolveDisplayName(guild, row.userId);
      return ltrLine(
        `**${i + 1}.** **${ltrIsolate(name)}** — **${row.count}** ${action.noun}`,
      );
    }),
  );

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`${action.emoji} ${title}`)
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Top 10 · Most received" });
}

export async function buildActionsLbPayload(
  guild: Guild,
  index: number,
): Promise<{
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
}> {
  const i = wrapIndex(index);
  const action = ACTIONS[i]!;
  const embed = await buildEmbed(guild, action);
  return { embeds: [embed], components: [navRow(i)] };
}

/**
 * `!actions` — browse every action top-10 with arrows.
 * `!actions hug` — jump to that action’s board (aliases OK).
 * Unknown action name → silent no-op.
 */
export async function handleActionsCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  let index = 0;

  const filter = args[0]?.toLowerCase();
  if (filter) {
    const action = getAction(filter);
    if (!action) return;
    index = ACTIONS.findIndex((a) => a.name === action.name);
    if (index < 0) return;
  }

  const payload = await buildActionsLbPayload(message.guild, index);
  await message.reply(payload);
}

/** Arrow navigation on `!actions` embeds. */
export async function onActionsLbInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith(`${PREFIX}:`)) return false;
  if (!interaction.inGuild() || !interaction.guild) {
    await interaction.reply({
      content: "Use this in a server.",
      ephemeral: true,
    });
    return true;
  }

  const parts = interaction.customId.split(":");
  const dir = parts[1];
  const current = Number(parts[2]);
  if (
    (dir !== "prev" && dir !== "next") ||
    !Number.isInteger(current)
  ) {
    return true;
  }

  const nextIndex =
    dir === "prev" ? wrapIndex(current - 1) : wrapIndex(current + 1);

  await interaction.deferUpdate();
  const payload = await buildActionsLbPayload(interaction.guild, nextIndex);
  await interaction.editReply(payload);
  return true;
}
