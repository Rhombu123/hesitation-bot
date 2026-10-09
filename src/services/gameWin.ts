import { EmbedBuilder, type Guild, type GuildMember, type TextBasedChannel } from "discord.js";
import { config, GAME_EMBED_COLOR, POINTS_EMOJI } from "../config.js";
import { addCurrency, getWeeklyPointsRank } from "./currency.js";
import { tryAnnounceLootDrop } from "./lootDrops.js";
import {
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  INFO_EMOJI_ID,
  INFO_EMOJI_NAME,
  MOUSE_EMOJI_ID,
  MOUSE_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

const WIN_COLOR = GAME_EMBED_COLOR;

/** Award a currency point and build the shared “won a point” reply payload. */
export async function buildGameWinPayload(opts: {
  guildId: string;
  userId: string;
  reward?: number;
  guild?: Guild | null;
  /** When set, roll ultra-rare loot after awarding the point. */
  channel?: TextBasedChannel | null;
  member?: GuildMember | null;
}): Promise<{ embeds: EmbedBuilder[] }> {
  const reward = opts.reward ?? 1;
  try {
    await addCurrency(opts.guildId, opts.userId, reward);
  } catch (err) {
    console.error("[games] Currency reward failed:", err);
  }

  let rankText = "#N/A";
  try {
    const rank = await getWeeklyPointsRank(opts.guildId, opts.userId);
    if (rank !== null) rankText = `#${rank}`;
  } catch (err) {
    console.warn("[games] Rank lookup failed:", err);
  }

  const guild = opts.guild ?? null;
  const [crown, info, mouse] = await Promise.all([
    resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME),
    resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME),
    resolveEmojiById(guild, MOUSE_EMOJI_ID, MOUSE_EMOJI_NAME),
  ]);

  const mention = ltrIsolate(`<@${opts.userId}>`);
  const rankings = `<#${config.geniusLeaderboardChannelId}>`;
  const embed = new EmbedBuilder()
    .setColor(WIN_COLOR)
    .setDescription(
      [
        `${crown} **Rank** \`${rankText}\``,
        ltrLine(`${info} ${mention} **won a point** ${POINTS_EMOJI}!`),
        `${mouse} **Check the Rankings:** ${rankings}`,
      ].join("\n"),
    )
    .setFooter({ text: "Win games to climb higher in the weekly lb" });

  if (opts.channel && guild) {
    const member =
      opts.member ??
      (await guild.members.fetch(opts.userId).catch(() => null));
    if (member) {
      await tryAnnounceLootDrop(opts.channel, member).catch((err) =>
        console.error("[games] loot drop failed:", err),
      );
    }
  }

  return { embeds: [embed] };
}
