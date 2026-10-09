import {
  AttachmentBuilder,
  DiscordAPIError,
  EmbedBuilder,
  type Guild,
  type Message,
} from "discord.js";
import { EMBED_COLOR, optionalEnv } from "../config.js";
import { getChannelDailyTop } from "../services/channelDailyMessages.js";
import {
  getLounge,
  type LoungeKey,
} from "../services/topMessengerRole.js";
import { renderLtopImage } from "../services/ltopImage.js";
import {
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  NUMBER_EMOJI_IDS,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { dailyDateString, msUntilNextDailyReset } from "../utils/helpers.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";

async function rankIcon(guild: Guild, rank: number): Promise<string> {
  const id = NUMBER_EMOJI_IDS[rank];
  if (!id) return `**${rank}.**`;

  const resolved = await resolveEmojiById(guild, id, `num${rank}`);
  if (!guild.emojis.cache.has(id)) {
    console.warn(
      `[ltop] Rank emoji for ${rank} (id ${id}) not found in guild ${guild.id}`,
    );
  }
  return resolved;
}

/** Socialize-style "in 20 minutes" next-reset text. */
function formatNextResetPhrase(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60_000));
  if (totalMin < 60) {
    return `in ${totalMin} minute${totalMin === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (mins === 0) {
    return `in ${hours} hour${hours === 1 ? "" : "s"}`;
  }
  return `in ${hours} hour${hours === 1 ? "" : "s"} ${mins} minute${mins === 1 ? "" : "s"}`;
}

async function textEmbed(
  guild: Guild,
  loungeLabel: string,
  rows: { rank: number; count: number; userId: string }[],
): Promise<EmbedBuilder> {
  const [crown, ...icons] = await Promise.all([
    resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME),
    ...rows.map((row) => rankIcon(guild, row.rank)),
  ]);

  const top = rows[0]!;
  const rankingLines = rows.map((row, i) =>
    ltrLine(
      `${icons[i]} ${ltrIsolate(`<@${row.userId}>`)} | **${row.count}** message${row.count === 1 ? "" : "s"}`,
    ),
  );

  const resetPhrase = formatNextResetPhrase(msUntilNextDailyReset());
  const iconURL = guild.client.user?.displayAvatarURL({ size: 128 });

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({
      name: `${loungeLabel} Daily Activity Leaderboard`,
      ...(iconURL ? { iconURL } : {}),
    })
    .setDescription(
      [
        ltrLine(
          `${crown} Top Active User — ${ltrIsolate(`<@${top.userId}>`)}`,
        ),
        "",
        "__Rankings:__",
        ...rankingLines,
        "",
        `⏰ **Next Reset:** \`${resetPhrase}\``,
      ].join("\n"),
    )
    .setFooter({ text: "Updates every minute" });
}

export async function handleLtopCommand(
  message: Message<true>,
  args: string[] = [],
): Promise<void> {
  const raw = (args[0] ?? "").trim();
  if (raw !== "1" && raw !== "2") {
    await message.reply(
      "Usage: `!ltop 1` (Lounge 1) or `!ltop 2` (Lounge 2).",
    );
    return;
  }

  const loungeKey = raw as LoungeKey;
  const lounge = getLounge(loungeKey);
  const date = dailyDateString();
  const top = await getChannelDailyTop(
    message.guildId,
    lounge.channelId,
    10,
    date,
  );

  if (top.length === 0) {
    await message.reply(
      `No messages counted yet today in **${lounge.label}** (<#${lounge.channelId}>).`,
    );
    return;
  }

  await message.guild.emojis.fetch().catch((err) =>
    console.warn("[ltop] Could not refresh guild emojis:", err),
  );

  const rows = top.map((row, i) => ({
    rank: i + 1,
    count: row.count,
    userId: row.userId,
  }));

  const embed = await textEmbed(message.guild, lounge.label, rows);

  const useImage = optionalEnv("LTOP_USE_IMAGE") === "true";
  if (!useImage) {
    await message.reply({ embeds: [embed] });
    return;
  }

  try {
    const namedRows = await Promise.all(
      rows.map(async (row) => {
        let name = `<@${row.userId}>`;
        try {
          const member = await message.guild.members.fetch(row.userId);
          name = member.displayName;
        } catch {
          /* keep mention */
        }
        return { rank: row.rank, name, count: row.count };
      }),
    );
    const png = await renderLtopImage(namedRows, date);
    const file = new AttachmentBuilder(png, { name: "ltop.png" });
    await message.reply({
      embeds: [
        EmbedBuilder.from(embed)
          .setImage("attachment://ltop.png")
          .setDescription(null),
      ],
      files: [file],
    });
  } catch (err) {
    const blocked =
      err instanceof DiscordAPIError &&
      (err.code === 400001 || err.status === 403);
    if (blocked) {
      console.warn(
        "[ltop] File uploads limited in this guild — using text leaderboard with custom number emojis.",
      );
    } else {
      console.error("[ltop] Image render/send failed, using text fallback:", err);
    }
    await message.reply({ embeds: [embed] });
  }
}
