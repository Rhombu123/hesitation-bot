/**
 * Action GIF provider — Klipy + custom pool.
 * GIFs are downloaded and re-uploaded as Discord attachments so embeds
 * don't depend on Discord's flaky third-party image proxy.
 */

import { CUSTOM_ACTION_MEDIA } from "../config/customActionMedia.js";
import { config } from "../config.js";

export type ActionGifAttachment = {
  buffer: Buffer;
  name: string;
  source: "custom" | "klipy";
};

const KLIPY = "https://api.klipy.com/api/v1";
const GIF_CACHE_TTL_MS = 10 * 60_000;
const MAX_GIF_BYTES = 8 * 1024 * 1024;
const DOWNLOAD_ATTEMPTS = 8;
const SEARCH_TIMEOUT_MS = 6_000;
const DOWNLOAD_TIMEOUT_MS = 8_000;

/** Countable actions (`!kill`, `!hug`, …) only pick from the API's top N. */
export const COUNTABLE_ACTION_GIF_LIMIT = 10;

/** Klipy search results cached per query — random pick without re-fetching. */
const gifCache = new Map<string, { urls: string[]; expiresAt: number }>();

/** URLs that failed download recently — skip until process restart / TTL. */
const deadUrls = new Map<string, number>();
const DEAD_TTL_MS = 30 * 60_000;

const HEADERS = {
  Accept: "application/json",
  "User-Agent": "hesitation-bot/1.0 (Discord; +https://railway.app)",
} as const;

type KlipyMediaObject = { url?: string };
type KlipyMediaFormats = Record<string, KlipyMediaObject | undefined>;
type KlipyFileFormat = { url?: string };
type KlipyFileTier = {
  gif?: KlipyFileFormat;
  webp?: KlipyFileFormat;
  mp4?: KlipyFileFormat;
};
type KlipyGif = {
  file?: Record<string, KlipyFileTier | undefined>;
  media_formats?: KlipyMediaFormats;
  url?: string;
};

function isGifUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith(".gif")) return true;
    if (path.includes(".gif")) return true;
    const format = new URL(url).searchParams.get("format")?.toLowerCase();
    return format === "gif";
  } catch {
    return url.toLowerCase().includes(".gif");
  }
}

function isVideoUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return (
      path.endsWith(".mp4") ||
      path.endsWith(".webm") ||
      path.endsWith(".mov")
    );
  } catch {
    const lower = url.toLowerCase();
    return lower.includes(".mp4") || lower.includes(".webm");
  }
}

/** Prefer real GIF URLs; for known gif-format fields allow CDN URLs without .gif. */
function acceptGifUrl(
  url: string | undefined | null,
  opts?: { trustGifFormat?: boolean },
): string | null {
  if (!url) return null;
  if (isVideoUrl(url)) return null;
  if (isGifUrl(url)) return url;
  if (opts?.trustGifFormat && !isVideoUrl(url)) return url;
  return null;
}

/** Native Klipy shape: `file.md.gif.url` only (ignore mp4 / webp). */
function klipyUrlFromFile(file: KlipyGif["file"]): string | null {
  if (!file) return null;
  for (const tier of ["md", "sm", "hd", "xs"] as const) {
    const url = acceptGifUrl(file[tier]?.gif?.url, { trustGifFormat: true });
    if (url) return url;
  }
  return null;
}

/** Tenor-migration shape: gif format keys only. */
function klipyUrlFromMediaFormats(
  formats: KlipyMediaFormats | undefined,
): string | null {
  if (!formats) return null;
  for (const key of ["mediumgif", "gif", "tinygif", "nanogif"] as const) {
    const url = acceptGifUrl(formats[key]?.url);
    if (url) return url;
  }
  return null;
}

function klipyUrlFromItem(item: KlipyGif): string | null {
  return (
    klipyUrlFromFile(item.file) ??
    klipyUrlFromMediaFormats(item.media_formats) ??
    acceptGifUrl(item.url)
  );
}

function unwrapKlipyResults(data: unknown): KlipyGif[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;

  let items = root.data;
  if (items && typeof items === "object" && !Array.isArray(items)) {
    items = (items as Record<string, unknown>).data;
  }
  if (Array.isArray(items)) return items as KlipyGif[];

  if (Array.isArray(root.results)) return root.results as KlipyGif[];
  return [];
}

/**
 * Search queries for an action — always a short sequential list (never parallel).
 * Countable: one ranked `anime <action>` query.
 * Freeform: try `anime <action>`, then bare `<action>` if that returns nothing.
 * (Old hug fallback mixed wrong GIFs into !kill / etc. — do not restore.)
 */
function searchQueriesForAction(
  action: string,
  opts?: { topOnly?: boolean },
): string[] {
  const a = action.trim().toLowerCase();
  if (!a) return [];
  if (opts?.topOnly) return [`anime ${a}`];
  return a.startsWith("anime ") ? [a] : [`anime ${a}`, a];
}

function markDead(url: string): void {
  deadUrls.set(url, Date.now() + DEAD_TTL_MS);
}

function isDead(url: string): boolean {
  const until = deadUrls.get(url);
  if (until == null) return false;
  if (until <= Date.now()) {
    deadUrls.delete(url);
    return false;
  }
  return true;
}

function isGifBuffer(buf: Buffer): boolean {
  // GIF87a / GIF89a
  return (
    buf.length >= 6 &&
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38
  );
}

function shuffleInPlace<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Serialize Klipy HTTP so freeform spam doesn't 429 the whole API key. */
let klipyChain: Promise<void> = Promise.resolve();

function enqueueKlipy<T>(fn: () => Promise<T>): Promise<T> {
  const run = klipyChain.then(fn, fn);
  klipyChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

type KlipySearchResult = { urls: string[]; rateLimited: boolean };

async function klipySearchOnce(
  key: string,
  query: string,
  page: number,
  perPage: number,
): Promise<KlipySearchResult> {
  const searchUrl = new URL(`${KLIPY}/${encodeURIComponent(key)}/gifs/search`);
  searchUrl.searchParams.set("q", query);
  searchUrl.searchParams.set("per_page", String(perPage));
  searchUrl.searchParams.set("page", String(page));
  searchUrl.searchParams.set("locale", "en_US");
  searchUrl.searchParams.set("rating", "pg-13");

  const res = await fetch(searchUrl, {
    headers: HEADERS,
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (res.status === 429) {
    console.warn(`[actionGifs] Klipy rate-limited for "${query}"`);
    return { urls: [], rateLimited: true };
  }
  if (!res.ok) {
    console.warn(
      `[actionGifs] Klipy HTTP ${res.status} for "${query}" p${page} (${res.statusText})`,
    );
    return { urls: [], rateLimited: false };
  }

  const rows = unwrapKlipyResults(await res.json());
  const urls = rows
    .map((row) => klipyUrlFromItem(row))
    .filter((url): url is string => Boolean(url));
  return { urls, rateLimited: false };
}

async function klipyUrlsForQuery(
  query: string,
  perPage: number,
): Promise<string[]> {
  const key = config.klipyApiKey;
  if (!key) return [];

  const cacheKey = `${query}::${perPage}`;
  const now = Date.now();
  const cached = gifCache.get(cacheKey);
  if (cached && cached.expiresAt > now && cached.urls.length > 0) {
    return cached.urls;
  }

  return enqueueKlipy(async () => {
    // Re-check cache after waiting in queue (another request may have filled it).
    const cachedAfter = gifCache.get(cacheKey);
    if (cachedAfter && cachedAfter.expiresAt > Date.now() && cachedAfter.urls.length > 0) {
      return cachedAfter.urls;
    }

    try {
      let result = await klipySearchOnce(key, query, 1, perPage);
      if (result.rateLimited) {
        await sleep(750);
        result = await klipySearchOnce(key, query, 1, perPage);
      }
      if (result.urls.length > 0) {
        gifCache.set(cacheKey, {
          urls: result.urls,
          expiresAt: Date.now() + GIF_CACHE_TTL_MS,
        });
      }
      return result.urls;
    } catch (err) {
      console.warn(`[actionGifs] Klipy failed for "${query}":`, err);
      return [];
    }
  });
}

/**
 * Resolve GIF URLs for an action.
 * Queries run **sequentially** (stop when we have results) so freeform
 * commands don't burn 4× rate-limit quota per use.
 */
async function klipyUrlsForAction(
  action: string,
  opts?: { topOnly?: boolean; limit?: number },
): Promise<string[]> {
  const limit = opts?.limit;
  const topOnly = opts?.topOnly ?? Boolean(limit);
  const perPage = limit ?? 25;
  const queries = searchQueriesForAction(action, { topOnly });

  const urls: string[] = [];
  for (const q of queries) {
    const batch = await klipyUrlsForQuery(q, perPage);
    for (const url of batch) {
      if (!urls.includes(url)) urls.push(url);
      if (limit != null && urls.length >= limit) return urls;
    }
    if (urls.length > 0) break;
  }
  return limit != null ? urls.slice(0, limit) : urls;
}

function customUrlsForAction(action: string): string[] {
  const urls = CUSTOM_ACTION_MEDIA[action];
  if (!urls?.length) return [];
  return urls.filter((url) => Boolean(acceptGifUrl(url)));
}

/**
 * Download + validate a GIF. Returns null if Discord couldn't host this safely.
 */
async function downloadGifBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "image/gif,image/*,*/*;q=0.8",
        "User-Agent": HEADERS["User-Agent"],
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) {
      console.warn(`[actionGifs] download HTTP ${res.status} for ${url}`);
      return null;
    }

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_GIF_BYTES) return null;

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 6 || buf.length > MAX_GIF_BYTES) return null;

    if (isGifBuffer(buf)) return buf;

    const ct = res.headers.get("content-type")?.toLowerCase() ?? "";
    // Some CDNs strip magic / mislabel; still accept if server says GIF.
    if (ct.includes("image/gif")) return buf;

    console.warn(
      `[actionGifs] not a GIF (${ct || "unknown type"}, ${buf.length}b): ${url}`,
    );
    return null;
  } catch (err) {
    console.warn(
      `[actionGifs] download failed:`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

/**
 * Pick a random working GIF and return bytes for Discord attachment upload.
 * Retries across the pool so one dead CDN URL never blank the embed.
 *
 * Countable actions should pass `{ topOnly: true, limit: 10 }` so we only
 * sample the API's top results for that action (no hug / unrelated fallbacks).
 */
export async function fetchActionGifAttachment(
  action: string,
  opts?: {
    useCustomPool?: boolean;
    /** Stick to a single ranked search (no multi-query / hug fallback). */
    topOnly?: boolean;
    /** Cap the Klipy pool to the first N results (API order = relevance). */
    limit?: number;
  },
): Promise<ActionGifAttachment | null> {
  const custom = opts?.useCustomPool ? customUrlsForAction(action) : [];
  const klipy = await klipyUrlsForAction(action, {
    topOnly: opts?.topOnly,
    limit: opts?.limit,
  });

  const candidates: { url: string; source: "custom" | "klipy" }[] = [
    ...custom.map((url) => ({ url, source: "custom" as const })),
    ...klipy.map((url) => ({ url, source: "klipy" as const })),
  ].filter((c) => !isDead(c.url));

  if (candidates.length === 0) {
    if (!config.klipyApiKey) {
      console.warn(
        "[actionGifs] KLIPY_API_KEY is not set — cannot fetch action GIFs.",
      );
    } else {
      console.warn(`[actionGifs] no GIF URLs for action "${action}"`);
    }
    return null;
  }

  shuffleInPlace(candidates);
  const tries = candidates.slice(0, DOWNLOAD_ATTEMPTS);

  for (const candidate of tries) {
    const buffer = await downloadGifBuffer(candidate.url);
    if (!buffer) {
      markDead(candidate.url);
      continue;
    }
    return {
      buffer,
      name: `action-${action.replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "gif"}.gif`,
      source: candidate.source,
    };
  }

  console.warn(
    `[actionGifs] all ${tries.length} download attempt(s) failed for "${action}"`,
  );
  return null;
}

/** @deprecated Prefer `fetchActionGifAttachment` — URL embeds break on Discord's proxy. */
export async function fetchActionGif(
  action: string,
  opts?: { useCustomPool?: boolean; topOnly?: boolean; limit?: number },
): Promise<{ url: string; source: "custom" | "klipy"; isVideo: false } | null> {
  const custom = opts?.useCustomPool ? customUrlsForAction(action) : [];
  const klipy = await klipyUrlsForAction(action, {
    topOnly: opts?.topOnly,
    limit: opts?.limit,
  });
  const pool = [...custom, ...klipy].filter((u) => !isDead(u));
  if (pool.length === 0) return null;
  const url = pool[Math.floor(Math.random() * pool.length)]!;
  return { url, source: custom.includes(url) ? "custom" : "klipy", isVideo: false };
}
