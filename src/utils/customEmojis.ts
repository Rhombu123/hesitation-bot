import type { Guild } from "discord.js";

/** Custom number emoji IDs (1–10) — used by `!ltop` rank icons. */
export const NUMBER_EMOJI_IDS: Readonly<Record<number, string>> = {
  1: "1529302071709401189",
  2: "1529302090801741824",
  3: "1529302232586129439",
  4: "1529302254941896865",
  5: "1529302273769869472",
  6: "1529302296457121893",
  7: "1529302315033428189",
  8: "1529302347099017236",
  9: "1529302365918724288",
  10: "1529302396268707900",
};

export const INFO_EMOJI_ID = "1529291039670665408";
export const INFO_EMOJI_NAME = "emoji_352";
export const UP_EMOJI_ID = "1529290896393244712";
/** Custom crown used across leaderboards and win embeds. */
export const CROWN_EMOJI_ID = "1547413500400246925";
export const CROWN_EMOJI_NAME = "crown-1";
/** Credits-shop tier crowns. */
export const VIP_CROWN_EMOJI_ID = "1535020856340906096";
export const VIP_CROWN_EMOJI_NAME = "vip_crown";
export const ELITE_CROWN_EMOJI_ID = "1535020883435851927";
export const ELITE_CROWN_EMOJI_NAME = "elite_crown";
export const SUPREME_CROWN_EMOJI_ID = "1535020916004884664";
export const SUPREME_CROWN_EMOJI_NAME = "supreme_crown";
/** Custom mouse cursor (e.g. “Check the Rankings”). */
export const MOUSE_EMOJI_ID = "1533892273232674867";
export const MOUSE_EMOJI_NAME = "mouse";
/** Custom emoji for the credits / redeem system. */
export const CREDITS_EMOJI_ID = "1533545637801365645";
export const CREDITS_EMOJI_NAME = "photooutput__1_removebgpreview";

/** Resolved Discord markdown, keyed by emoji id — avoids refetching every command. */
const emojiMarkdownCache = new Map<string, string>();

/** Generic Discord keycap number emojis for level-up text. */
const KEYCAP: Readonly<Record<string, string>> = {
  "0": "0️⃣",
  "1": "1️⃣",
  "2": "2️⃣",
  "3": "3️⃣",
  "4": "4️⃣",
  "5": "5️⃣",
  "6": "6️⃣",
  "7": "7️⃣",
  "8": "8️⃣",
  "9": "9️⃣",
};

/**
 * Resolve a guild emoji by ID so Discord gets the real name + animated flag.
 * Hardcoded `<:guess:id>` often fails to render when the name doesn't match.
 */
export function emojiById(
  guild: Guild | null | undefined,
  id: string,
  fallbackName: string,
): string {
  const cached = guild?.emojis.cache.get(id);
  if (cached) return cached.toString();
  return `<:${fallbackName}:${id}>`;
}

async function findEmojiMarkdown(
  guild: Guild | null | undefined,
  id: string,
): Promise<string | null> {
  if (!guild) return null;
  try {
    if (!guild.emojis.cache.has(id)) {
      await guild.emojis.fetch();
    }
  } catch (err) {
    console.warn(`[emojis] Failed to fetch emojis for guild ${guild.id}:`, err);
  }
  const cached = guild.emojis.cache.get(id);
  return cached ? cached.toString() : null;
}

/**
 * Resolve by ID from the current guild, then any other guild the bot is in.
 * Using the live Discord name (not a hardcoded guess) is required for rendering.
 */
export async function resolveEmojiById(
  guild: Guild | null | undefined,
  id: string,
  fallbackName: string,
): Promise<string> {
  const cached = emojiMarkdownCache.get(id);
  if (cached) return cached;

  const local = await findEmojiMarkdown(guild, id);
  if (local) {
    emojiMarkdownCache.set(id, local);
    return local;
  }

  const client = guild?.client;
  if (client) {
    for (const other of client.guilds.cache.values()) {
      if (guild && other.id === guild.id) continue;
      const found = await findEmojiMarkdown(other, id);
      if (found) {
        emojiMarkdownCache.set(id, found);
        return found;
      }
    }
  }

  return `<:${fallbackName}:${id}>`;
}

/**
 * CDN URL for a guild emoji (png/gif from Discord’s animated flag).
 * Falls back to static png when the emoji isn’t in cache.
 */
export async function resolveEmojiImageUrl(
  guild: Guild | null | undefined,
  id: string,
  size = 256,
): Promise<string> {
  if (guild) {
    try {
      if (!guild.emojis.cache.has(id)) {
        await guild.emojis.fetch();
      }
      const emoji = guild.emojis.cache.get(id);
      const url = emoji?.imageURL({ size, extension: emoji.animated ? "gif" : "png" });
      if (url) return url;
    } catch (err) {
      console.warn(`[emojis] Failed to resolve image URL for ${id}:`, err);
    }
  }
  return `https://cdn.discordapp.com/emojis/${id}.png?size=${size}&quality=lossless`;
}

/**
 * Format a number with generic Unicode keycap emojis (1️⃣, 2️⃣, …).
 * Used in level-up embeds — not the custom uploaded star numbers.
 */
export function formatEmojiNumber(n: number): string {
  const value = Math.max(0, Math.floor(n));
  if (value === 10) return "🔟";
  return String(value)
    .split("")
    .map((ch) => KEYCAP[ch] ?? ch)
    .join("");
}
