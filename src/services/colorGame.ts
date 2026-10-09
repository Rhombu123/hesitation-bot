import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type Interaction,
  type TextChannel,
} from "discord.js";
import { config, GAME_EMBED_COLOR } from "../config.js";
import { randomInt } from "../utils/helpers.js";
import { buildGameWinPayload } from "./gameWin.js";

const COLOR_EMBED = GAME_EMBED_COLOR;
const TIMEOUT_MS = 60_000;

export type ColorId =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple";

const COLORS: ReadonlyArray<{
  id: ColorId;
  label: string;
  emoji: string;
}> = [
  { id: "red", label: "Red", emoji: "🟥" },
  { id: "orange", label: "Orange", emoji: "🟧" },
  { id: "yellow", label: "Yellow", emoji: "🟨" },
  { id: "green", label: "Green", emoji: "🟩" },
  { id: "blue", label: "Blue", emoji: "🟦" },
  { id: "purple", label: "Purple", emoji: "🟪" },
];

const SWATCH_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets/color-swatch.png",
);
const SWATCH_NAME = "color-swatch.png";

type ActiveColorRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  correct: ColorId;
  /** Colors disabled after a wrong guess. */
  disabled: Set<ColorId>;
  /** Users who already used their one pick this round. */
  pickedUsers: Set<string>;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
};

/** channelId → active round */
const rounds = new Map<string, ActiveColorRound>();

export function getActiveColorRound(
  channelId: string,
): ActiveColorRound | undefined {
  return rounds.get(channelId);
}

function clearRound(channelId: string): void {
  const round = rounds.get(channelId);
  if (!round) return;
  clearTimeout(round.timeout);
  rounds.delete(channelId);
}

function buildButtons(
  disabled: ReadonlySet<ColorId>,
  allDisabled = false,
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < COLORS.length; i += 3) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const color of COLORS.slice(i, i + 3)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`color:pick:${color.id}`)
          .setLabel(color.label)
          .setEmoji(color.emoji)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(allDisabled || disabled.has(color.id)),
      );
    }
    rows.push(row);
  }
  return rows;
}

function startEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(COLOR_EMBED)
    .setTitle("🌈 Which color is it?")
    .setDescription("**Guess the color I'm thinking of** — **one pick** each.")
    .setThumbnail(`attachment://${SWATCH_NAME}`)
    .setFooter({ text: "One pick per person · Earn a point for winning" })
    .setTimestamp();
}

async function updateButtons(
  interaction: ButtonInteraction,
  round: ActiveColorRound,
  allDisabled: boolean,
): Promise<void> {
  try {
    await interaction.message.edit({
      components: buildButtons(round.disabled, allDisabled),
    });
  } catch (err) {
    console.warn("[colorGame] Failed to update buttons:", err);
  }
}

export async function startColorRound(channel: TextChannel): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const correct = COLORS[randomInt(0, COLORS.length - 1)]!.id;
  const swatch = new AttachmentBuilder(SWATCH_PATH, { name: SWATCH_NAME });

  const sent = await channel.send({
    embeds: [startEmbed()],
    components: buildButtons(new Set()),
    files: [swatch],
  });

  const timeout = setTimeout(() => {
    void (async () => {
      const round = rounds.get(channel.id);
      if (!round || round.ended) return;
      round.ended = true;
      clearRound(channel.id);
      try {
        const msg = await channel.messages.fetch(round.messageId);
        await msg.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_EMBED)
              .setTitle("🌈 Color round over")
              .setDescription("Time's up — nobody got it.")
              .setFooter({ text: "Earn a point for winning" }),
          ],
          components: buildButtons(round.disabled, true),
          // Drop the swatch file — otherwise Discord shows it as a huge image
          // once the embed no longer references it as a thumbnail.
          attachments: [],
        });
      } catch (err) {
        console.warn("[colorGame] Timeout update failed:", err);
      }
    })();
  }, TIMEOUT_MS);

  rounds.set(channel.id, {
    channelId: channel.id,
    guildId: channel.guildId,
    messageId: sent.id,
    correct,
    disabled: new Set(),
    pickedUsers: new Set(),
    ended: false,
    timeout,
  });

  console.log(`[colorGame] Round in ${channel.id}: correct=${correct}`);
  return true;
}

export async function onColorGameInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("color:pick:")) return false;

  const colorId = interaction.customId.slice("color:pick:".length) as ColorId;
  if (!COLORS.some((c) => c.id === colorId)) {
    await interaction.reply({ content: "Unknown color.", ephemeral: true });
    return true;
  }

  const round = rounds.get(interaction.channelId);
  if (!round || round.ended) {
    await interaction.reply({
      content: "This color round has ended.",
      ephemeral: true,
    });
    return true;
  }

  if (round.pickedUsers.has(interaction.user.id)) {
    await interaction.reply({
      content: "You already picked — **one pick** per person this round.",
      ephemeral: true,
    });
    return true;
  }

  if (round.disabled.has(colorId)) {
    await interaction.reply({
      content: "That color is already out — pick a different one!",
      ephemeral: true,
    });
    return true;
  }

  // Spend the user's one pick for this round.
  round.pickedUsers.add(interaction.user.id);

  if (colorId === round.correct) {
    round.ended = true;
    clearTimeout(round.timeout);
    rounds.delete(round.channelId);

    await interaction.deferUpdate();
    await updateButtons(interaction, round, true);

    const payload = await buildGameWinPayload({
      guildId: round.guildId,
      userId: interaction.user.id,
      reward: config.flagGameCurrencyReward,
      guild: interaction.guild,
      channel: interaction.channel,
      member: interaction.member as import("discord.js").GuildMember | null,
    });

    await interaction.followUp(payload);
    return true;
  }

  // Wrong — gray out that color; this user is locked out for the round.
  round.disabled.add(colorId);
  await interaction.deferUpdate();
  await updateButtons(interaction, round, false);

  await interaction.followUp({
    content: "❌ Wrong color — you're out for this round.",
    ephemeral: true,
  });

  return true;
}
