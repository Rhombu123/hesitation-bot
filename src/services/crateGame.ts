import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Interaction,
  type TextChannel,
} from "discord.js";
import { GAME_EMBED_COLOR, REP_UP_EMOJI } from "../config.js";
import {
  pickCrateRarity,
  pickRepRarity,
  rollCrateCredits,
  rollRepReward,
  formatCrateRarityLine,
  type CrateRarity,
  CRATE_RARITIES,
  REP_RARITIES,
} from "../config/creditRewards.js";
import { randomInt } from "../utils/helpers.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  INFO_EMOJI_ID,
  INFO_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { addCredits } from "./credits.js";
import { buildCrateWinMessage } from "./crateWin.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";
import { grantSystemReputation } from "./reputation.js";

const DURATION_MS = 45_000;
const CRATE_COUNT = 4;
const BOX_EMOJI = "📦";
const CHECK_EMOJI = "✅";

/** Crates award credits or rep — flags/colors award game points. */
type RewardKind = "credits" | "rep";

type ActiveCrateRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  /** Index 0–3 of the winning crate. */
  correctIndex: number;
  /** Crates already opened (wrong picks). */
  openedWrong: Set<number>;
  /** Users who already used their one pick this round. */
  pickedUsers: Set<string>;
  rewardKind: RewardKind;
  rarityId: CrateRarity;
  rarityLabel: string;
  color: number;
  minReward: number;
  maxReward: number;
  endsAtUnix: number;
  ended: boolean;
  timeout: ReturnType<typeof setTimeout>;
  channel: TextChannel;
};

const rounds = new Map<string, ActiveCrateRound>();

export function getActiveCrateRound(
  channelId: string,
): ActiveCrateRound | undefined {
  return rounds.get(channelId);
}

/**
 * Gray (Secondary) boxes while open; wrong stays gray+locked with 📦;
 * winner turns green (Success) with ✅.
 */
function crateButtons(
  round: ActiveCrateRound,
  opts: {
    wonIndex?: number;
    expired?: boolean;
  } = {},
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (let i = 0; i < CRATE_COUNT; i++) {
    const won = opts.wonIndex === i;
    const wrong = round.openedWrong.has(i);
    const locked =
      opts.wonIndex != null || opts.expired === true || wrong;

    let emoji = BOX_EMOJI;
    let style: ButtonStyle = ButtonStyle.Secondary;
    let disabled = locked;

    if (won) {
      emoji = CHECK_EMOJI;
      style = ButtonStyle.Success;
      disabled = true;
    }

    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`crate:pick:${i}`)
        .setEmoji(emoji)
        .setStyle(style)
        .setDisabled(disabled),
    );
  }
  return row;
}

async function formatRewardAmount(
  round: ActiveCrateRound,
  amount: number,
): Promise<string> {
  if (round.rewardKind === "rep") {
    return `**${amount}** rep ${REP_UP_EMOJI}`;
  }
  const creditsEmoji = await resolveEmojiById(
    round.channel.guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );
  return `**${amount}** credits ${creditsEmoji}`;
}

async function buildEmbed(
  round: ActiveCrateRound,
  opts: {
    finished?: boolean;
    winnerId?: string | null;
    reward?: number;
  } = {},
): Promise<EmbedBuilder> {
  const guild = round.channel.guild;
  const info = await resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME);
  const iconURL = round.channel.client.user?.displayAvatarURL({ size: 128 });

  let header: string;
  if (opts.finished && opts.winnerId && opts.reward != null) {
    const won = await formatRewardAmount(round, opts.reward);
    header = ltrLine(
      `${info} ${ltrIsolate(`<@${opts.winnerId}>`)} found the crate and won ${won}!`,
    );
  } else if (opts.finished) {
    header = `${info} Nobody found the crate — it vanished.`;
  } else {
    header = `${info} Pick a crate! **One** holds the prize — **one pick** each.`;
  }

  const footerLine = [
    formatCrateRarityLine(round.rarityId, round.rarityLabel),
    `📅 **Expires:** <t:${round.endsAtUnix}:R>`,
  ].join("\n");

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor({
      name: "A Mysterious Crate Has Appeared!",
      ...(iconURL ? { iconURL } : {}),
    })
    .setDescription([header, "", footerLine].join("\n"));
}

async function announceWinner(
  round: ActiveCrateRound,
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
    kind: round.rewardKind,
    rarityLabel: round.rarityLabel,
  });

  await round.channel.send(win).catch((err) =>
    console.warn("[crateGame] Failed to send congrats:", err),
  );

  if (member) {
    await tryAnnounceLootDrop(round.channel, member).catch((err) =>
      console.error("[crateGame] loot drop failed:", err),
    );
  }
}

async function finishCrateRound(
  round: ActiveCrateRound,
  opts: {
    winnerId?: string;
    wonIndex?: number;
    reward?: number;
  } = {},
): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  clearTimeout(round.timeout);
  rounds.delete(round.channelId);

  const embed = await buildEmbed(round, {
    finished: true,
    winnerId: opts.winnerId ?? null,
    reward: opts.reward,
  });

  try {
    const msg = await round.channel.messages.fetch(round.messageId);
    await msg.edit({
      embeds: [embed],
      components: [
        crateButtons(round, {
          wonIndex: opts.wonIndex,
          expired: opts.wonIndex == null,
        }),
      ],
    });
  } catch (err) {
    console.warn("[crateGame] Failed to finalize message:", err);
  }

  if (opts.winnerId && opts.reward != null && opts.reward > 0) {
    await announceWinner(round, opts.winnerId, opts.reward);
    console.log(
      `[crateGame] ${opts.winnerId} won ${opts.reward} ${round.rewardKind} in ${round.channelId}`,
    );
  }
}

export async function startCrateRound(channel: TextChannel): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const rewardKind: RewardKind = randomInt(0, 1) === 0 ? "rep" : "credits";
  const rarity =
    rewardKind === "rep" ? pickRepRarity() : pickCrateRarity();
  const endsAtUnix = Math.floor((Date.now() + DURATION_MS) / 1000);
  const correctIndex = randomInt(0, CRATE_COUNT - 1);

  const round: ActiveCrateRound = {
    channelId: channel.id,
    guildId: channel.guild.id,
    messageId: "",
    correctIndex,
    openedWrong: new Set(),
    pickedUsers: new Set(),
    rewardKind,
    rarityId: rarity.id,
    rarityLabel: rarity.label,
    color: rarity.color,
    minReward: "minRep" in rarity ? rarity.minRep : rarity.minCredits,
    maxReward: "maxRep" in rarity ? rarity.maxRep : rarity.maxCredits,
    endsAtUnix,
    ended: false,
    timeout: setTimeout(() => {
      void finishCrateRound(round);
    }, DURATION_MS),
    channel,
  };

  const embed = await buildEmbed(round);
  const sent = await channel.send({
    embeds: [embed],
    components: [crateButtons(round)],
  });
  round.messageId = sent.id;
  rounds.set(channel.id, round);

  console.log(
    `[crateGame] Started in ${channel.id} — ${rewardKind} ${rarity.label} correct=#${correctIndex}`,
  );
  return true;
}

export async function onCrateGameInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (!interaction.customId.startsWith("crate:pick:")) return false;

  const pickRaw = interaction.customId.split(":")[2];
  const pick = Number(pickRaw);
  if (!Number.isInteger(pick) || pick < 0 || pick >= CRATE_COUNT) return true;

  const round = rounds.get(interaction.channelId);
  if (!round || round.ended) {
    await interaction.reply({
      content: "This crate round has expired.",
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

  if (round.openedWrong.has(pick)) {
    await interaction.reply({
      content: "That crate is empty — pick a different one!",
      ephemeral: true,
    });
    return true;
  }

  // Spend the user's one pick for this round.
  round.pickedUsers.add(interaction.user.id);

  // Wrong pick — lock that box; this user is out for the round.
  if (pick !== round.correctIndex) {
    round.openedWrong.add(pick);
    const embed = await buildEmbed(round);
    await interaction.update({
      embeds: [embed],
      components: [crateButtons(round)],
    });
    await interaction
      .followUp({
        content: "❌ Empty — you're out for this round.",
        ephemeral: true,
      })
      .catch(() => {});
    return true;
  }

  // Correct pick — lock immediately, then award.
  round.ended = true;
  clearTimeout(round.timeout);
  rounds.delete(round.channelId);

  let reward = 0;
  if (round.rewardKind === "rep") {
    const rarity =
      REP_RARITIES.find((r) => r.id === round.rarityId) ?? REP_RARITIES[0]!;
    reward = rollRepReward(rarity);
    try {
      await grantSystemReputation({
        guildId: round.guildId,
        userId: interaction.user.id,
        amount: reward,
        source: "crate",
      });
    } catch (err) {
      console.error("[crateGame] Rep award failed:", err);
    }
  } else {
    const rarity =
      CRATE_RARITIES.find((r) => r.id === round.rarityId) ?? CRATE_RARITIES[0]!;
    reward = rollCrateCredits(rarity);
    try {
      await addCredits(round.guildId, interaction.user.id, reward);
    } catch (err) {
      console.error("[crateGame] Credit award failed:", err);
    }
  }

  const embed = await buildEmbed(round, {
    finished: true,
    winnerId: interaction.user.id,
    reward,
  });

  await interaction.update({
    embeds: [embed],
    components: [crateButtons(round, { wonIndex: pick })],
  });

  await announceWinner(round, interaction.user.id, reward);
  console.log(
    `[crateGame] ${interaction.user.id} won ${reward} ${round.rewardKind} in ${round.channelId}`,
  );
  return true;
}
