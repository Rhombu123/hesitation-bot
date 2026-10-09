import {
  EmbedBuilder,
  type Guild,
  type GuildMember,
  type User,
} from "discord.js";
import { GAME_EMBED_COLOR, POINTS_EMOJI, REP_UP_EMOJI } from "../config.js";
import {
  CREDITS_EMOJI_ID,
  CREDITS_EMOJI_NAME,
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";

const WIN_COLOR = GAME_EMBED_COLOR;

export type CrateWinRewardKind = "credits" | "points" | "rep";

/**
 * Socialize-style “Congratulations!” crate / game win embed.
 * Mentions the winner, shows crown + credit / point / rep reward.
 */
export async function buildCrateWinMessage(opts: {
  guild: Guild | null;
  guildId: string;
  winner: GuildMember | User;
  amount: number;
  kind: CrateWinRewardKind;
  rarityLabel?: string;
}): Promise<{
  content: string;
  embeds: EmbedBuilder[];
}> {
  const user = "user" in opts.winner ? opts.winner.user : opts.winner;
  const displayName =
    "displayName" in opts.winner ? opts.winner.displayName : user.username;
  const avatarUrl = opts.winner.displayAvatarURL({ size: 128 });

  const crown = await resolveEmojiById(
    opts.guild,
    CROWN_EMOJI_ID,
    CROWN_EMOJI_NAME,
  );
  const creditsEmoji = await resolveEmojiById(
    opts.guild,
    CREDITS_EMOJI_ID,
    CREDITS_EMOJI_NAME,
  );

  let rewardEmoji: string;
  let rewardWord: string;
  if (opts.kind === "points") {
    rewardEmoji = POINTS_EMOJI;
    rewardWord = "points";
  } else if (opts.kind === "rep") {
    rewardEmoji = REP_UP_EMOJI;
    rewardWord = "rep";
  } else {
    rewardEmoji = creditsEmoji;
    rewardWord = "credits";
  }

  const rarityBit = opts.rarityLabel ? ` (${opts.rarityLabel})` : "";

  const embed = new EmbedBuilder()
    .setColor(WIN_COLOR)
    .setAuthor({
      name: `Congratulations ${displayName}!`,
      iconURL: avatarUrl,
    })
    .setDescription(
      // Use display name (not <@id>) so Discord doesn't soft-wrap after the
      // wide mention chip mid-sentence. The ping is already in `content`.
      `🎁 ${crown} **${displayName}** received ${rewardEmoji} **__${opts.amount}__ ${rewardWord}!**${rarityBit}`,
    );

  return {
    content: `<@${user.id}>`,
    embeds: [embed],
  };
}
