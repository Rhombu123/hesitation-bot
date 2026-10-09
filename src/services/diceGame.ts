import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Interaction,
  type TextChannel,
} from "discord.js";
import {
  pickCrateRarity,
  rollCrateCredits,
  formatCrateRarityLine,
  type CrateRarity,
  CRATE_RARITIES,
} from "../config/creditRewards.js";
import { GAME_EMBED_COLOR } from "../config.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  INFO_EMOJI_ID,
  INFO_EMOJI_NAME,
  NUMBER_EMOJI_IDS,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { addCredits } from "./credits.js";
import { buildCrateWinMessage } from "./crateWin.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";

const DURATION_MS = 45_000;
const DICE_MIN = 1;
const DICE_MAX = 6;

type RollEntry = { userId: string; roll: number };

type ActiveDiceRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  rarityId: CrateRarity;
  rarityLabel: string;
  color: number;
  minCredits: number;
  maxCredits: number;
  endsAtUnix: number;
  ended: boolean;
  rolls: Map<string, number>;
  timeout: ReturnType<typeof setTimeout>;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveDiceRound>();

export function getActiveDiceRound(
  channelId: string,
): ActiveDiceRound | undefined {
  return rounds.get(channelId);
}

function rollButton(disabled: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("dice:roll")
      .setLabel(disabled ? "Expired" : "Roll Dice")
      .setEmoji("🎲")
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

function sortedRolls(rolls: Map<string, number>): RollEntry[] {
  return [...rolls.entries()]
    .map(([userId, roll]) => ({ userId, roll }))
    .sort((a, b) => b.roll - a.roll || a.userId.localeCompare(b.userId));
}

async function rankEmoji(
  channel: TextChannel,
  rank: number,
): Promise<string> {
  const guild = channel.guild;
  const id = NUMBER_EMOJI_IDS[rank];
  if (!id) return `**${rank}.**`;
  return resolveEmojiById(guild, id, `num${rank}`);
}

async function buildEmbed(
  round: ActiveDiceRound,
  opts: {
    finished?: boolean;
    winnerId?: string | null;
    reward?: number;
  } = {},
): Promise<EmbedBuilder> {
  const guild = round.channel.guild;
  const info = await resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME);
  const creditsEmoji = await resolveEmojiById(
    guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );
  const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
  const iconURL = round.channel.client.user?.displayAvatarURL({ size: 128 });

  const entries = sortedRolls(round.rolls);
  let rollsBlock: string;
  if (entries.length === 0) {
    rollsBlock = "_No rolls yet — be the first!_";
  } else {
    const lines: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      const medal = await rankEmoji(round.channel, i + 1);
      lines.push(
        ltrLine(`${medal} ${ltrIsolate(`<@${e.userId}>`)} — **${e.roll}**`),
      );
    }
    rollsBlock = lines.join("\n");
  }

  const footerLine = [
    formatCrateRarityLine(round.rarityId, round.rarityLabel),
    `📅 **Expires:** <t:${round.endsAtUnix}:R>`,
  ].join("\n");

  let header: string;
  if (opts.finished && opts.winnerId && opts.reward != null) {
    header = ltrLine(
      `${crown} ${ltrIsolate(`<@${opts.winnerId}>`)} won **${opts.reward}** credits ${creditsEmoji}!`,
    );
  } else if (opts.finished) {
    header = `${info} Nobody rolled — the dice vanished.`;
  } else {
    header = `${info} The **person** with the **highest roll** wins! (Natural **6** = instant win)`;
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor({
      name: "A Mysterious Dice Has Appeared!",
      ...(iconURL ? { iconURL } : {}),
    })
    .setDescription(
      [header, "", "🎲 **Rolls:**", rollsBlock, "", footerLine].join("\n"),
    );
}

async function announceWinner(
  round: ActiveDiceRound,
  winnerId: string,
  reward: number,
): Promise<void> {
  const member = await round.channel.guild.members
    .fetch(winnerId)
    .catch(() => null);
  const user =
    member?.user ??
    (await round.channel.client.users.fetch(winnerId).catch(() => null));
  if (!user) return;

  const win = await buildCrateWinMessage({
    guild: round.channel.guild,
    guildId: round.guildId,
    winner: member ?? user,
    amount: reward,
    kind: "credits",
    rarityLabel: round.rarityLabel,
  });

  await round.channel.send(win).catch((err) =>
    console.warn("[diceGame] Failed to send congrats:", err),
  );

  if (member) {
    await tryAnnounceLootDrop(round.channel, member).catch((err) =>
      console.error("[diceGame] loot drop failed:", err),
    );
  }
}

async function finishDiceRound(
  round: ActiveDiceRound,
  forcedWinnerId?: string,
): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  clearTimeout(round.timeout);
  rounds.delete(round.channelId);

  const entries = sortedRolls(round.rolls);
  let winnerId: string | null = forcedWinnerId ?? null;
  let reward = 0;

  if (!winnerId && entries.length > 0) {
    const top = entries[0]!.roll;
    const tied = entries.filter((e) => e.roll === top);
    winnerId = tied[Math.floor(Math.random() * tied.length)]!.userId;
  }

  if (winnerId) {
    const rarity = CRATE_RARITIES.find((r) => r.id === round.rarityId)!;
    reward = rollCrateCredits(rarity);
    try {
      await addCredits(round.guildId, winnerId, reward);
    } catch (err) {
      console.error("[diceGame] Credit award failed:", err);
    }
  }

  const embed = await buildEmbed(round, {
    finished: true,
    winnerId,
    reward: winnerId ? reward : undefined,
  });

  try {
    const msg = await round.channel.messages.fetch(round.messageId);
    await msg.edit({
      embeds: [embed],
      components: [rollButton(true)],
    });
  } catch (err) {
    console.warn("[diceGame] Failed to finalize message:", err);
  }

  if (winnerId && reward > 0) {
    await announceWinner(round, winnerId, reward);
    console.log(
      `[diceGame] ${winnerId} won ${reward} credits (${round.rarityLabel}) in ${round.channelId}`,
    );
  }
}

export async function startDiceRound(channel: TextChannel): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const rarity = pickCrateRarity();
  const endsAtUnix = Math.floor((Date.now() + DURATION_MS) / 1000);

  const round: ActiveDiceRound = {
    channelId: channel.id,
    guildId: channel.guild.id,
    messageId: "",
    rarityId: rarity.id,
    rarityLabel: rarity.label,
    color: rarity.color,
    minCredits: rarity.minCredits,
    maxCredits: rarity.maxCredits,
    endsAtUnix,
    ended: false,
    rolls: new Map(),
    timeout: setTimeout(() => {
      void finishDiceRound(round);
    }, DURATION_MS),
    channel,
  };

  const embed = await buildEmbed(round);
  const sent = await channel.send({
    embeds: [embed],
    components: [rollButton(false)],
  });
  round.messageId = sent.id;
  rounds.set(channel.id, round);

  console.log(
    `[diceGame] ${rarity.label} dice in ${channel.id} (${rarity.minCredits}–${rarity.maxCredits} credits)`,
  );
  return true;
}

export async function onDiceGameInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (interaction.customId !== "dice:roll") return false;

  const round = rounds.get(interaction.channelId);
  if (!round || round.ended) {
    await interaction.reply({
      content: "This dice round has expired.",
      ephemeral: true,
    });
    return true;
  }

  if (round.rolls.has(interaction.user.id)) {
    await interaction.reply({
      content: `You already rolled a **${round.rolls.get(interaction.user.id)}**.`,
      ephemeral: true,
    });
    return true;
  }

  const roll =
    Math.floor(Math.random() * (DICE_MAX - DICE_MIN + 1)) + DICE_MIN;
  round.rolls.set(interaction.user.id, roll);

  if (roll === 6) {
    const embed = await buildEmbed(round);
    await interaction.update({
      embeds: [embed],
      components: [rollButton(true)],
    });
    await finishDiceRound(round, interaction.user.id);
    return true;
  }

  const embed = await buildEmbed(round);
  await interaction.update({
    embeds: [embed],
    components: [rollButton(false)],
  });
  return true;
}
