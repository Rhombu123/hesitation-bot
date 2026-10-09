import {
  EmbedBuilder,
  type Message,
  type TextChannel,
} from "discord.js";
import { GAME_EMBED_COLOR, REP_UP_EMOJI } from "../config.js";
import {
  CRATE_RARITIES,
  pickCrateRarity,
  pickRepRarity,
  rollCrateCredits,
  rollRepReward,
  formatCrateRarityLine,
  type CrateRarity,
  REP_RARITIES,
} from "../config/creditRewards.js";
import { randomInt } from "../utils/helpers.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { addCredits } from "./credits.js";
import { buildCrateWinMessage } from "./crateWin.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";
import { grantSystemReputation } from "./reputation.js";

export const CRATE_GAME_GREEN = 0x57f287;

type RewardKind = "credits" | "rep";

export type CrateTypingReward = {
  rewardKind: RewardKind;
  rarityId: CrateRarity;
  rarityLabel: string;
  reward: number;
};

export function rollCrateTypingReward(): CrateTypingReward {
  const rewardKind: RewardKind = randomInt(0, 1) === 0 ? "rep" : "credits";
  const rarity =
    rewardKind === "rep" ? pickRepRarity() : pickCrateRarity();
  const reward =
    rewardKind === "rep"
      ? rollRepReward(
          REP_RARITIES.find((r) => r.id === rarity.id) ?? REP_RARITIES[0]!,
        )
      : rollCrateCredits(
          CRATE_RARITIES.find((r) => r.id === rarity.id) ?? CRATE_RARITIES[0]!,
        );
  return {
    rewardKind,
    rarityId: rarity.id,
    rarityLabel: rarity.label,
    reward,
  };
}

export async function formatCrateTypingRewardText(
  channel: TextChannel,
  reward: CrateTypingReward,
): Promise<string> {
  if (reward.rewardKind === "rep") {
    return `${reward.reward} Reputation ${REP_UP_EMOJI}`;
  }
  const creditsEmoji = await resolveEmojiById(
    channel.guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );
  return `${reward.reward} Credits ${creditsEmoji}`;
}

export function mysteriousCrateAuthor(channel: TextChannel): {
  name: string;
  iconURL?: string;
} {
  const iconURL = channel.client.user?.displayAvatarURL({ size: 128 });
  return {
    name: "A Mysterious Crate Has Appeared!",
    ...(iconURL ? { iconURL } : {}),
  };
}

export function buildBackwardsConfirmEmbed(
  word: string,
  answer: string,
): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(CRATE_GAME_GREEN)
    .setDescription(`✅ \`${word}\` backwards is \`${answer}\`!`);
}

export async function awardCrateTypingReward(
  guildId: string,
  userId: string,
  reward: CrateTypingReward,
  source: string,
): Promise<void> {
  if (reward.rewardKind === "rep") {
    await grantSystemReputation({
      guildId,
      userId,
      amount: reward.reward,
      source,
    });
  } else {
    await addCredits(guildId, userId, reward.reward);
  }
}

export async function announceCrateTypingWin(opts: {
  channel: TextChannel;
  winnerMessage: Message<true>;
  reward: CrateTypingReward;
  confirmEmbed?: EmbedBuilder;
}): Promise<void> {
  const { channel, winnerMessage, reward, confirmEmbed } = opts;
  await winnerMessage.react("✅").catch(() => {});

  if (confirmEmbed) {
    await winnerMessage
      .reply({ embeds: [confirmEmbed] })
      .catch((err) => console.warn("[crateTyping] confirm reply failed:", err));
  }

  const member = winnerMessage.member;
  const user = winnerMessage.author;

  try {
    await awardCrateTypingReward(
      channel.guild.id,
      user.id,
      reward,
      "crate-typing",
    );
  } catch (err) {
    console.error("[crateTyping] award failed:", err);
  }

  const win = await buildCrateWinMessage({
    guild: channel.guild,
    guildId: channel.guild.id,
    winner: member ?? user,
    amount: reward.reward,
    kind: reward.rewardKind,
    rarityLabel: reward.rarityLabel,
  });

  await channel
    .send({ content: win.content, embeds: win.embeds })
    .catch((err) => console.warn("[crateTyping] congrats failed:", err));

  if (member) {
    await tryAnnounceLootDrop(channel, member).catch((err) =>
      console.error("[crateTyping] loot drop failed:", err),
    );
  }
}

export { GAME_EMBED_COLOR, formatCrateRarityLine };
