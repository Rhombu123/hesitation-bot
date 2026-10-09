import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Interaction,
  type Message,
  type TextChannel,
} from "discord.js";
import { GAME_EMBED_COLOR } from "../config.js";
import {
  pickCrateRarity,
  pickRepRarity,
  formatCrateRarityLine,
  type CrateRarity,
} from "../config/creditRewards.js";
import { randomInt } from "../utils/helpers.js";
import {
  MOUSE_EMOJI_ID,
  MOUSE_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { addCredits } from "./credits.js";
import { buildCrateWinMessage } from "./crateWin.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";
import { grantSystemReputation } from "./reputation.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const ROUND_TIMEOUT_MS = 20_000;

type LightPhase = "red" | "green" | "ended";
type RewardKind = "credits" | "rep";

type ActiveLightRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  phase: LightPhase;
  fouled: Set<string>;
  expiresUnix: number;
  flipTimer: ReturnType<typeof setTimeout>;
  endTimer: ReturnType<typeof setTimeout>;
  rarityId: CrateRarity;
  rarityLabel: string;
  color: number;
  minReward: number;
  maxReward: number;
  rewardKind: RewardKind;
};

const rounds = new Map<string, ActiveLightRound>();

export function getActiveLightRound(
  channelId: string,
): ActiveLightRound | undefined {
  return rounds.get(channelId);
}

function clearTimers(round: ActiveLightRound): void {
  clearTimeout(round.flipTimer);
  clearTimeout(round.endTimer);
}

function clearRound(channelId: string): void {
  const round = rounds.get(channelId);
  if (!round) return;
  clearTimers(round);
  rounds.delete(channelId);
}

function pressButton(opts: {
  phase: LightPhase;
  disabled?: boolean;
}): ActionRowBuilder<ButtonBuilder> {
  const disabled = opts.disabled ?? false;
  if (opts.phase === "ended") {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("light:click")
        .setLabel("Expired")
        .setEmoji("🟢")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );
  }
  if (opts.phase === "red") {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("light:click")
        .setLabel("Press Me!")
        .setEmoji("🔴")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    );
  }
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("light:click")
      .setLabel("Press Me!")
      .setEmoji("🟢")
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
}

function lightAuthor(channel: TextChannel): { name: string; iconURL?: string } {
  const iconURL = channel.client.user?.displayAvatarURL({ size: 128 });
  return {
    name: "Red Light Green Light!",
    ...(iconURL ? { iconURL } : {}),
  };
}

async function lightEmbed(opts: {
  channel: TextChannel;
  round: ActiveLightRound;
  phase: "red" | "green" | "ended";
  winnerMention?: string;
}): Promise<EmbedBuilder> {
  const expires = `<t:${opts.round.expiresUnix}:R>`;
  const mouse = await resolveEmojiById(
    opts.channel.guild,
    MOUSE_EMOJI_ID,
    MOUSE_EMOJI_NAME,
  );

  let statusBlock: string;
  if (opts.phase === "red") {
    statusBlock = [
      "🔴 **RED LIGHT!**",
      "⛔ Wait for green — don't press yet!",
    ].join("\n");
  } else if (opts.phase === "green") {
    statusBlock = [
      "🟢 **GREEN LIGHT!**",
      "✅ First to press wins. Don't be slow!",
    ].join("\n");
  } else if (opts.winnerMention) {
    statusBlock = [
      "🟢 **GREEN LIGHT!**",
      ltrLine(
        `✅ ${ltrIsolate(opts.winnerMention)} got there first!`,
      ),
    ].join("\n");
  } else {
    statusBlock = [
      "🔴 **EXPIRED**",
      "⏰ Nobody pressed in time.",
    ].join("\n");
  }

  return new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setAuthor(lightAuthor(opts.channel))
    .setDescription(
      [
        "🚦 **RED LIGHT GREEN LIGHT**",
        `${mouse} Press the **button** when it's Green!`,
        "",
        statusBlock,
        "",
        formatCrateRarityLine(opts.round.rarityId, opts.round.rarityLabel),
        `🗓️ **Expires:** ${expires}`,
      ].join("\n"),
    );
}

export async function startLightRound(channel: TextChannel): Promise<boolean> {
  if (rounds.has(channel.id)) return false;

  const rewardKind: RewardKind = randomInt(0, 1) === 0 ? "credits" : "rep";
  const rarity =
    rewardKind === "rep" ? pickRepRarity() : pickCrateRarity();
  const delayMs = randomInt(3_000, 7_000);
  const expiresUnix = Math.floor(
    (Date.now() + delayMs + ROUND_TIMEOUT_MS) / 1000,
  );

  const pending: Omit<ActiveLightRound, "flipTimer" | "endTimer" | "messageId"> & {
    messageId: string;
    flipTimer?: ReturnType<typeof setTimeout>;
    endTimer?: ReturnType<typeof setTimeout>;
  } = {
    channelId: channel.id,
    guildId: channel.guildId,
    messageId: "",
    phase: "red",
    fouled: new Set(),
    expiresUnix,
    rarityId: rarity.id,
    rarityLabel: rarity.label,
    color: rarity.color,
    minReward: "minRep" in rarity ? rarity.minRep : rarity.minCredits,
    maxReward: "maxRep" in rarity ? rarity.maxRep : rarity.maxCredits,
    rewardKind,
  };

  const sent = await channel.send({
    embeds: [
      await lightEmbed({
        channel,
        round: pending as ActiveLightRound,
        phase: "red",
      }),
    ],
    components: [pressButton({ phase: "red" })],
  });
  pending.messageId = sent.id;

  const flipTimer = setTimeout(() => {
    void (async () => {
      const active = rounds.get(channel.id);
      if (!active || active.phase !== "red") return;
      active.phase = "green";
      try {
        const msg = await channel.messages.fetch(active.messageId);
        await msg.edit({
          embeds: [
            await lightEmbed({ channel, round: active, phase: "green" }),
          ],
          components: [pressButton({ phase: "green" })],
        });
      } catch (err) {
        console.warn("[lightGame] Failed to flip to green:", err);
        clearRound(channel.id);
      }
    })();
  }, delayMs);

  const endTimer = setTimeout(() => {
    void (async () => {
      const active = rounds.get(channel.id);
      if (!active || active.phase === "ended") return;
      active.phase = "ended";
      clearRound(channel.id);
      try {
        const msg = await channel.messages.fetch(active.messageId);
        await msg.edit({
          embeds: [
            await lightEmbed({ channel, round: active, phase: "ended" }),
          ],
          components: [pressButton({ phase: "ended" })],
        });
      } catch (err) {
        console.warn("[lightGame] Timeout update failed:", err);
      }
    })();
  }, delayMs + ROUND_TIMEOUT_MS);

  const round: ActiveLightRound = {
    ...pending,
    flipTimer,
    endTimer,
  };
  rounds.set(channel.id, round);

  console.log(
    `[lightGame] ${rarity.label} ${rewardKind} round in ${channel.id}: flips green in ${delayMs}ms`,
  );
  return true;
}

export async function onLightGameInteraction(
  interaction: Interaction,
): Promise<boolean> {
  if (!interaction.inGuild()) return false;
  if (!interaction.isButton()) return false;
  if (interaction.customId !== "light:click") return false;

  const round = rounds.get(interaction.channelId);
  if (!round || round.phase === "ended") {
    await interaction.reply({
      content: "This round has ended.",
      ephemeral: true,
    });
    return true;
  }

  if (round.fouled.has(interaction.user.id)) {
    await interaction.reply({
      content: "You pressed too early — you're out this round.",
      ephemeral: true,
    });
    return true;
  }

  if (round.phase === "red") {
    round.fouled.add(interaction.user.id);
    await interaction.reply({
      content: "🔴 Too early! Wait for **green** next time.",
      ephemeral: true,
    });
    return true;
  }

  round.phase = "ended";
  clearTimers(round);
  rounds.delete(round.channelId);

  await interaction.deferUpdate();

  const amount = randomInt(round.minReward, round.maxReward);

  const channel = interaction.channel;
  try {
    const msg = interaction.message as Message;
    if (channel && "guild" in channel && channel.isTextBased()) {
      await msg.edit({
        embeds: [
          await lightEmbed({
            channel: channel as TextChannel,
            round,
            phase: "ended",
            winnerMention: `<@${interaction.user.id}>`,
          }),
        ],
        components: [pressButton({ phase: "ended" })],
      });
    } else {
      await msg.edit({
        components: [pressButton({ phase: "ended" })],
      });
    }
  } catch (err) {
    console.warn("[lightGame] Failed to lock buttons:", err);
  }

  if (round.rewardKind === "rep") {
    try {
      await grantSystemReputation({
        guildId: round.guildId,
        userId: interaction.user.id,
        amount,
        source: "light",
      });
    } catch (err) {
      console.error("[lightGame] Rep award failed:", err);
    }
  } else {
    try {
      await addCredits(round.guildId, interaction.user.id, amount);
    } catch (err) {
      console.error("[lightGame] Credit award failed:", err);
    }
  }

  const member =
    interaction.member && "displayName" in interaction.member
      ? interaction.member
      : await interaction.guild?.members
          .fetch(interaction.user.id)
          .catch(() => null);

  const win = await buildCrateWinMessage({
    guild: interaction.guild,
    guildId: round.guildId,
    winner: member ?? interaction.user,
    amount,
    kind: round.rewardKind,
    rarityLabel: round.rarityLabel,
  });

  await interaction.followUp(win);

  const textChannel = interaction.channel;
  if (
    member &&
    "guild" in member &&
    textChannel &&
    textChannel.isTextBased() &&
    !textChannel.isDMBased()
  ) {
    await tryAnnounceLootDrop(textChannel, member).catch((err) =>
      console.error("[lightGame] loot drop failed:", err),
    );
  }
  return true;
}
