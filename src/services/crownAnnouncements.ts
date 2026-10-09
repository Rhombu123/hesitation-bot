import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  EmbedBuilder,
  type Client,
  type Guild,
  type Message,
  type Role,
  type TextChannel,
} from "discord.js";
import { config } from "../config.js";
import { formatUtcWeekEnding } from "../utils/helpers.js";

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);

const GENIUS_TITLE = "Genius Update";
const POPULAR_TITLE = "Popularity Update";
const COLLECTOR_TITLE = "Collector Update";
const RULER_TITLE = "Hesitation Ruler Update";
const GENIUS_THUMB = "genius-thumb.png";
const POPULAR_THUMB = "popular-thumb.png";

/** Screenshot-matched accent colors. */
const GENIUS_COLOR = 0x143b96;
const POPULAR_COLOR = 0x143b96;
const COLLECTOR_COLOR = 0x143b96;
const RULER_COLOR = 0xfbbf24;

let cachedGeniusAnnounceId: string | null = null;
let cachedPopularAnnounceId: string | null = null;
let cachedCollectorAnnounceId: string | null = null;
let cachedRulerAnnounceId: string | null = null;

function isTextGuildChannel(
  channel: unknown,
): channel is TextChannel & { guild: Guild } {
  return (
    !!channel &&
    typeof channel === "object" &&
    "isTextBased" in channel &&
    typeof (channel as TextChannel).isTextBased === "function" &&
    (channel as TextChannel).isTextBased() &&
    "guild" in channel &&
    !!(channel as { guild?: Guild }).guild &&
    "messages" in channel
  );
}

function announcedUserId(message: Message): string | null {
  const desc = message.embeds[0]?.description ?? "";
  const match = desc.match(/<@!?(\d{15,21})>/);
  return match?.[1] ?? null;
}

async function findAnnounceMessage(
  channel: TextChannel,
  title: string,
  preferId: string | null,
): Promise<Message | null> {
  if (preferId) {
    const existing = await channel.messages.fetch(preferId).catch(() => null);
    if (
      existing &&
      existing.author.id === channel.client.user?.id &&
      existing.embeds.some((e) => e.title === title)
    ) {
      return existing;
    }
  }

  const fetched = await channel.messages.fetch({ limit: 50 }).catch((err) => {
    console.warn("[crownAnnounce] Failed to scan channel history:", err);
    return null;
  });
  if (!fetched) return null;

  const matches = [...fetched.values()]
    .filter(
      (m) =>
        m.author.id === channel.client.user?.id &&
        m.embeds.some((e) => e.title === title),
    )
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const keep = matches[0] ?? null;
  for (const dup of matches.slice(1)) {
    await dup.delete().catch(() => null);
  }
  return keep;
}

function rankingLink(guildId: string, channelId: string): string {
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function weekAwardedLine(weekAwardedId: string): string {
  return `📅 **Week ending:** ${formatUtcWeekEnding(weekAwardedId)}`;
}

function buildGeniusUpdateEmbed(opts: {
  winnerId: string;
  roleId: string;
  guildId: string;
  weekAwardedId: string;
}): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  const thumb = new AttachmentBuilder(path.join(ASSETS, GENIUS_THUMB), {
    name: GENIUS_THUMB,
  });
  const here = rankingLink(opts.guildId, config.geniusLeaderboardChannelId);
  return {
    embed: new EmbedBuilder()
      .setColor(GENIUS_COLOR)
      .setTitle(GENIUS_TITLE)
      .setThumbnail(`attachment://${GENIUS_THUMB}`)
      .setDescription(
        [
          `<@${opts.winnerId}> is now the genius of the week!`,
          "For winning the most games, they have been given",
          `🏆 New Role: <@&${opts.roleId}>`,
          weekAwardedLine(opts.weekAwardedId),
          "⏲️ Next Reset: **7 Days**",
          `🎢 Discover the Ranking: [Here](${here})`,
        ].join("\n"),
      )
      .setFooter({ text: `Last updated · week of ${opts.weekAwardedId}` })
      .setTimestamp(),
    files: [thumb],
  };
}

function buildPopularUpdateEmbed(opts: {
  winnerId: string;
  roleId: string;
  guildId: string;
  weekAwardedId: string;
}): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  const thumb = new AttachmentBuilder(path.join(ASSETS, POPULAR_THUMB), {
    name: POPULAR_THUMB,
  });
  const here = rankingLink(opts.guildId, config.popularLeaderboardChannelId);
  return {
    embed: new EmbedBuilder()
      .setColor(POPULAR_COLOR)
      .setTitle(POPULAR_TITLE)
      .setThumbnail(`attachment://${POPULAR_THUMB}`)
      .setDescription(
        [
          `<@${opts.winnerId}> won this week's popularity contest!`,
          "For being **#1** in positive reps this week, they have been given",
          `🏆 New Role: <@&${opts.roleId}>`,
          weekAwardedLine(opts.weekAwardedId),
          "⏲️ Next Reset: **7 Days**",
          `🎢 Discover the Ranking: [Here](${here})`,
        ].join("\n"),
      )
      .setFooter({ text: `Last updated · week of ${opts.weekAwardedId}` })
      .setTimestamp(),
    files: [thumb],
  };
}

function buildCollectorUpdateEmbed(opts: {
  winnerId: string;
  roleId: string;
  guildId: string;
  weekAwardedId: string;
}): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  const thumb = new AttachmentBuilder(path.join(ASSETS, POPULAR_THUMB), {
    name: POPULAR_THUMB,
  });
  const here = rankingLink(opts.guildId, config.levelCommandChannelId);
  return {
    embed: new EmbedBuilder()
      .setColor(COLLECTOR_COLOR)
      .setTitle(COLLECTOR_TITLE)
      .setThumbnail(`attachment://${POPULAR_THUMB}`)
      .setDescription(
        [
          `<@${opts.winnerId}> is now the collector of the week!`,
          "For collecting the **most find value** with `!find`, they have been given",
          `🏆 New Role: <@&${opts.roleId}>`,
          weekAwardedLine(opts.weekAwardedId),
          "⏲️ Next Reset: **7 Days**",
          `🎢 Discover the Ranking: [Here](${here})`,
        ].join("\n"),
      )
      .setFooter({ text: `Last updated · week of ${opts.weekAwardedId}` })
      .setTimestamp(),
    files: [thumb],
  };
}

function buildRulerUpdateEmbed(opts: {
  winnerId: string;
  roleId: string;
  guildId: string;
  weekAwardedId: string;
}): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  const thumb = new AttachmentBuilder(path.join(ASSETS, POPULAR_THUMB), {
    name: POPULAR_THUMB,
  });
  const loungeId = config.lounge1ChannelId;
  const here = rankingLink(opts.guildId, loungeId);
  return {
    embed: new EmbedBuilder()
      .setColor(RULER_COLOR)
      .setTitle(RULER_TITLE)
      .setThumbnail(`attachment://${POPULAR_THUMB}`)
      .setDescription(
        [
          `<@${opts.winnerId}> is now **Hesitation Ruler**!`,
          "For having the **most boosted** Supreme custom role last week, they have been given",
          `👑 New Role: <@&${opts.roleId}>`,
          "🎡 **Gradient unlock** on their custom role via `!role setup`",
          weekAwardedLine(opts.weekAwardedId),
          "⏲️ Next Reset: **7 Days**",
          `⚡ Boost leaderboard: \`!role overview\` · [Lounge](${here})`,
        ].join("\n"),
      )
      .setFooter({ text: `Last updated · week of ${opts.weekAwardedId}` })
      .setTimestamp(),
    files: [thumb],
  };
}

export type CrownAnnounceKind = "genius" | "popular" | "collector" | "ruler";

/** Same embed used for the channel announce and the winner DM. */
export function buildCrownAnnouncePayload(
  kind: CrownAnnounceKind,
  opts: {
    winnerId: string;
    roleId: string;
    guildId: string;
    weekAwardedId: string;
  },
): { embed: EmbedBuilder; files: AttachmentBuilder[] } {
  switch (kind) {
    case "genius":
      return buildGeniusUpdateEmbed(opts);
    case "popular":
      return buildPopularUpdateEmbed(opts);
    case "collector":
      return buildCollectorUpdateEmbed(opts);
    case "ruler":
      return buildRulerUpdateEmbed(opts);
  }
}

async function upsertAnnounce(
  channel: TextChannel,
  title: string,
  preferId: string | null,
  payload: { embed: EmbedBuilder; files: AttachmentBuilder[] },
  winnerId: string,
  forceUpdate: boolean,
): Promise<string> {
  const existing = await findAnnounceMessage(channel, title, preferId);
  if (existing) {
    const current = announcedUserId(existing);
    if (!forceUpdate && current === winnerId) {
      return existing.id;
    }
    await existing.edit({
      embeds: [payload.embed],
      files: payload.files,
    });
    console.log(
      `[crownAnnounce] Updated ${title} → <@${winnerId}> (${existing.id})`,
    );
    return existing.id;
  }

  const sent = await channel.send({
    embeds: [payload.embed],
    files: payload.files,
  });
  console.log(
    `[crownAnnounce] Posted ${title} → <@${winnerId}> (${sent.id})`,
  );
  return sent.id;
}

/**
 * Post Genius / Popular / Collector / Hesitation Ruler update embeds.
 * Call only on UTC week rollover (same moment as winner DMs) — never on ready/redeploy.
 */
export async function syncCrownAnnouncements(
  client: Client,
  guild: Guild,
  opts: {
    geniusWinnerId: string | null;
    popularWinnerId: string | null;
    collectorWinnerId: string | null;
    rulerWinnerId: string | null;
    geniusRole: Role;
    popularRole: Role;
    collectorRole: Role;
    rulerRole: Role;
    weekAwardedId: string;
  },
): Promise<void> {
  const channel = await client.channels
    .fetch(config.crownAnnounceChannelId)
    .catch(() => null);
  if (!isTextGuildChannel(channel)) {
    console.warn(
      `[crownAnnounce] Channel ${config.crownAnnounceChannelId} missing or not text.`,
    );
    return;
  }

  if (opts.geniusWinnerId) {
    const payload = buildCrownAnnouncePayload("genius", {
      winnerId: opts.geniusWinnerId,
      roleId: opts.geniusRole.id,
      guildId: guild.id,
      weekAwardedId: opts.weekAwardedId,
    });
    cachedGeniusAnnounceId = await upsertAnnounce(
      channel,
      GENIUS_TITLE,
      cachedGeniusAnnounceId,
      payload,
      opts.geniusWinnerId,
      true,
    );
  }

  if (opts.popularWinnerId) {
    const payload = buildCrownAnnouncePayload("popular", {
      winnerId: opts.popularWinnerId,
      roleId: opts.popularRole.id,
      guildId: guild.id,
      weekAwardedId: opts.weekAwardedId,
    });
    cachedPopularAnnounceId = await upsertAnnounce(
      channel,
      POPULAR_TITLE,
      cachedPopularAnnounceId,
      payload,
      opts.popularWinnerId,
      true,
    );
  }

  if (opts.collectorWinnerId) {
    const payload = buildCrownAnnouncePayload("collector", {
      winnerId: opts.collectorWinnerId,
      roleId: opts.collectorRole.id,
      guildId: guild.id,
      weekAwardedId: opts.weekAwardedId,
    });
    cachedCollectorAnnounceId = await upsertAnnounce(
      channel,
      COLLECTOR_TITLE,
      cachedCollectorAnnounceId,
      payload,
      opts.collectorWinnerId,
      true,
    );
  }

  if (opts.rulerWinnerId) {
    const payload = buildCrownAnnouncePayload("ruler", {
      winnerId: opts.rulerWinnerId,
      roleId: opts.rulerRole.id,
      guildId: guild.id,
      weekAwardedId: opts.weekAwardedId,
    });
    cachedRulerAnnounceId = await upsertAnnounce(
      channel,
      RULER_TITLE,
      cachedRulerAnnounceId,
      payload,
      opts.rulerWinnerId,
      true,
    );
  }
}
