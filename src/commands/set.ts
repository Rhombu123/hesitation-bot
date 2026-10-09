import {
  EmbedBuilder,
  type Guild,
  type GuildEmoji,
  type Message,
} from "discord.js";
import {
  hasElite,
  hasMythic,
  hasSupreme,
  ROLE_IDS,
} from "../config/rolePrivileges.js";
import {
  clearPingReactionSet,
  getPingReactionSet,
  setPingReactionSet,
  type PingReactionEmoji,
} from "../services/pingReactions.js";
import { resolveEmojiById } from "../utils/customEmojis.js";

const SET_EMBED_GREEN = 0x57f287;
const SET_EMBED_RED = 0xed4245;
const CHECK_EMOJI_ID = "1543725515523883049";
const MAX_EMOJIS = 3;

/** Custom Discord emoji markup in message content. */
const CUSTOM_EMOJI_RE = /<a?:([\w]+):(\d{15,21})>/g;

function canUseSet(member: NonNullable<Message["member"]>): boolean {
  return hasElite(member) || hasSupreme(member) || hasMythic(member);
}

function buildSetDeniedEmbed(guild: Message["guild"]): EmbedBuilder {
  const elite =
    ROLE_IDS.elite && guild?.roles.cache.get(ROLE_IDS.elite)
      ? `<@&${ROLE_IDS.elite}>`
      : "**Elite**";
  return new EmbedBuilder()
    .setColor(SET_EMBED_RED)
    .setDescription(`You must have ${elite} to run this command`);
}

function isUnicodeEmoji(segment: string): boolean {
  if (!segment || /^\s+$/.test(segment)) return false;
  // Plain text / shortcodes like :name: are not unicode emoji
  if (/^:[\w~+]+:$/.test(segment)) return false;
  if (/^[\w.,!?;:'"\-_/\\:]+$/u.test(segment)) return false;
  // Must contain at least one non-ASCII symbol (emoji range-ish)
  return /[^\u0000-\u007f]/.test(segment);
}

function guildEmojiToSet(emoji: GuildEmoji): PingReactionEmoji {
  return {
    react: emoji.identifier, // name:id — works with message.react()
    display: emoji.toString(), // <:name:id> / <a:name:id>
  };
}

/**
 * Parse emojis from `.set` args. Custom emojis must belong to this guild
 * so the bot can display and react with them.
 */
export async function parseGuildSetEmojis(
  guild: Guild,
  raw: string,
): Promise<
  | { ok: true; emojis: PingReactionEmoji[] }
  | { ok: false; reason: string }
> {
  const text = raw.trim();
  if (!text) {
    return { ok: false, reason: "Include at least one emoji after `.set`." };
  }

  try {
    await guild.emojis.fetch();
  } catch (err) {
    console.warn("[set] Failed to fetch guild emojis:", err);
  }

  const found: PingReactionEmoji[] = [];
  const seen = new Set<string>();
  const externalNames: string[] = [];

  const push = (emoji: PingReactionEmoji) => {
    if (seen.has(emoji.react)) return;
    seen.add(emoji.react);
    found.push(emoji);
  };

  let working = text;
  for (const match of text.matchAll(CUSTOM_EMOJI_RE)) {
    const full = match[0]!;
    const name = match[1]!;
    const id = match[2]!;
    working = working.replace(full, " ");

    const guildEmoji = guild.emojis.cache.get(id);
    if (!guildEmoji) {
      externalNames.push(name);
      continue;
    }
    push(guildEmojiToSet(guildEmoji));
  }

  // Shortcodes like :bongo_cat_heart: — not usable for reactions
  const shortcodes = [...working.matchAll(/:([\w~+]{2,}):/g)].map((m) => m[1]!);
  for (const name of shortcodes) {
    working = working.replace(`:${name}:`, " ");
    const byName = guild.emojis.cache.find(
      (e) => e.name?.toLowerCase() === name.toLowerCase(),
    );
    if (byName) {
      push(guildEmojiToSet(byName));
    } else {
      externalNames.push(name);
    }
  }

  const leftover = working.replace(/\s+/g, "");
  const segmenter =
    typeof Intl !== "undefined" && "Segmenter" in Intl
      ? new Intl.Segmenter("en", { granularity: "grapheme" })
      : null;

  if (segmenter) {
    for (const { segment } of segmenter.segment(leftover)) {
      if (!isUnicodeEmoji(segment)) continue;
      push({ react: segment, display: segment });
    }
  } else if (leftover && isUnicodeEmoji(leftover)) {
    push({ react: leftover, display: leftover });
  }

  if (found.length === 0) {
    if (externalNames.length > 0) {
      return {
        ok: false,
        reason:
          `**:${externalNames[0]}:** isn't an emoji from **this server**.`,
      };
    }
    return {
      ok: false,
      reason:
        "Include a **server emoji** or Unicode emoji after `.set`.\nExample: pick one from this server's emoji picker.",
    };
  }

  if (externalNames.length > 0 && found.length > 0) {
    return {
      ok: false,
      reason:
        `Skipped external emoji **:${externalNames[0]}:** — only emojis from **this server** (or Unicode) can be used.`,
    };
  }

  if (found.length > MAX_EMOJIS) {
    return {
      ok: false,
      reason: `You can set at most **${MAX_EMOJIS}** emojis.`,
    };
  }

  return { ok: true, emojis: found };
}

export async function handleSetCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  if (!canUseSet(member)) {
    await message.reply({ embeds: [buildSetDeniedEmbed(message.guild)] });
    return;
  }

  const joined = args.join(" ").trim();
  const sub = (args[0] ?? "").toLowerCase();

  if (!joined || sub === "help") {
    const current = await getPingReactionSet(message.guildId, member.id);
    if (current.length === 0) {
      await message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(SET_EMBED_GREEN)
            .setDescription(
              ["Choose an emoji from this server.", "EX: !set 🌙"].join("\n"),
            ),
        ],
      });
      return;
    }
    const check = await resolveEmojiById(
      message.guild,
      CHECK_EMOJI_ID,
      "check",
    );
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(SET_EMBED_GREEN)
          .setDescription(
            `${check} Your reactions are currently set to: ${current.map((e) => e.display).join("")}\nClear with \`.set clear\``,
          ),
      ],
    });
    return;
  }

  if (sub === "clear" || sub === "reset" || sub === "remove" || sub === "off") {
    const cleared = await clearPingReactionSet(message.guildId, member.id);
    const check = await resolveEmojiById(
      message.guild,
      CHECK_EMOJI_ID,
      "check",
    );
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(SET_EMBED_GREEN)
          .setDescription(
            cleared
              ? `${check} Your ping reactions have been cleared.`
              : `${check} You don't have any ping reactions set.`,
          ),
      ],
    });
    return;
  }

  const parsed = await parseGuildSetEmojis(message.guild, joined);
  if (!parsed.ok) {
    await message.reply(parsed.reason);
    return;
  }

  await setPingReactionSet(message.guildId, member.id, parsed.emojis);

  const check = await resolveEmojiById(message.guild, CHECK_EMOJI_ID, "check");
  const display = parsed.emojis.map((e) => e.display).join("");

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(SET_EMBED_GREEN)
        .setDescription(
          `${check} Your reactions have been set to: ${display}`,
        ),
    ],
  });
}
