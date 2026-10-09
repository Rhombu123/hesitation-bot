import type { FindCatalogItem, FindCategory } from "../data/findCatalog.js";

/** Mirrors catalog generator — stripped from generated item names. */
const FIND_BRANDS = new Set(
  [
    "joyhoosh",
    "northline",
    "velora",
    "kinetix",
    "bluecrest",
    "sunforge",
    "urbanpeak",
    "novacraft",
    "silveroak",
    "brightpath",
    "corewave",
    "zenith",
    "pulse",
    "evergreen",
    "metroflex",
    "aerolite",
    "trueform",
    "peakline",
    "clearview",
    "stoneriver",
    "hesitation",
  ].map((b) => b.toLowerCase()),
);

const FIND_ADJECTIVES = new Set(
  [
    "pro",
    "ultra",
    "classic",
    "premium",
    "compact",
    "deluxe",
    "essential",
    "portable",
    "wireless",
    "smart",
    "vintage",
    "modern",
    "eco",
    "mini",
    "max",
    "daily",
    "studio",
    "active",
    "fresh",
    "bold",
  ].map((a) => a.toLowerCase()),
);

const imageCache = new Map<string, string>();
const CACHE_MAX = 1_000;
const SEARCH_TIMEOUT_MS = 5_000;
const OPENVERSE_TIMEOUT_MS = 2_500;

/** Extra search prefix for ambiguous catalog product names. */
const CATEGORY_SEARCH_HINT: Partial<Record<FindCategory, string>> = {
  food: "food",
  garden: "garden",
  beauty: "beauty product",
  toys: "toy",
  sports: "sports equipment",
  electronics: "electronics",
  automotive: "car accessory",
  office: "office supply",
  fashion: "clothing",
  home: "home",
};

/**
 * Pull the product phrase from a generated find name.
 * e.g. "Sunforge portable instant ramen pack model 8106" → "instant ramen pack"
 */
export function extractFindImageQuery(itemName: string): string {
  let text = itemName.replace(/\s+model\s+\d+\s*$/i, "").trim();
  text = text.replace(/\s*\(legendary\)\s*$/i, "").trim();

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return itemName;

  if (words.length > 1 && FIND_BRANDS.has(words[0]!.toLowerCase())) {
    words.shift();
  }

  if (words.length > 1 && FIND_ADJECTIVES.has(words[0]!.toLowerCase())) {
    words.shift();
  }

  const query = words.join(" ").trim();
  return query || itemName;
}

/** Try the full phrase, then shorter tails (e.g. "ramen pack", "basket"). */
function queryVariants(query: string): string[] {
  const words = query.split(/\s+/).filter(Boolean);
  const variants: string[] = [];

  const add = (phrase: string) => {
    const key = phrase.toLowerCase();
    if (phrase && !variants.some((v) => v.toLowerCase() === key)) {
      variants.push(phrase);
    }
  };

  add(query);
  if (words.length >= 3) add(words.slice(-2).join(" "));
  if (words.length >= 2) {
    const last = words[words.length - 1]!;
    if (last.length >= 5) add(last);
  }

  return variants;
}

/** Higher = better match between API title and our product phrase. */
function scoreTitleMatch(title: string, query: string): number {
  const titleNorm = title.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
  const queryLower = query.toLowerCase();
  const queryWords = queryLower.split(/\s+/).filter((w) => w.length >= 3);

  if (queryWords.length === 0) return 0;

  let score = 0;
  for (const word of queryWords) {
    if (titleNorm.includes(word)) score++;
  }

  if (titleNorm.includes(queryLower)) {
    score += queryWords.length * 2;
  }

  if (titleNorm.includes("historical marker") && !queryLower.includes("historical")) {
    score -= 10;
  }

  if (score === queryWords.length) score += 2;
  return score;
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function safeSearch(
  label: string,
  query: string,
  fn: (query: string) => Promise<string | null>,
): Promise<string | null> {
  try {
    return await fn(query);
  } catch (err) {
    console.warn(`[find:image] ${label} failed for "${query}":`, err);
    return null;
  }
}

function pickBestScored(
  candidates: Array<{ title: string; url: string }>,
  query: string,
): string | null {
  let best: { url: string; score: number } | null = null;

  for (const { title, url } of candidates) {
    const score = scoreTitleMatch(title, query);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { url, score };
    }
  }

  return best?.url ?? null;
}

async function searchWikipedia(query: string): Promise<string | null> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "5");
  url.searchParams.set("prop", "pageimages|info");
  url.searchParams.set("inprop", "url");
  url.searchParams.set("piprop", "thumbnail");
  url.searchParams.set("pithumbsize", "400");
  url.searchParams.set("format", "json");

  const res = await fetchWithTimeout(url.toString(), SEARCH_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        { title?: string; thumbnail?: { source?: string } }
      >;
    };
  };

  const candidates: Array<{ title: string; url: string }> = [];
  for (const page of Object.values(data.query?.pages ?? {})) {
    const thumb = page.thumbnail?.source;
    if (thumb && page.title) {
      candidates.push({ title: page.title, url: thumb });
    }
  }

  return pickBestScored(candidates, query);
}

async function searchWikimediaCommons(query: string): Promise<string | null> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("gsrlimit", "8");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime");
  url.searchParams.set("iiurlwidth", "400");
  url.searchParams.set("format", "json");

  const res = await fetchWithTimeout(url.toString(), SEARCH_TIMEOUT_MS);
  if (!res.ok) return null;

  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          title?: string;
          imageinfo?: Array<{ thumburl?: string; mime?: string }>;
        }
      >;
    };
  };

  const candidates: Array<{ title: string; url: string }> = [];
  for (const page of Object.values(data.query?.pages ?? {})) {
    const title = page.title ?? "";
    for (const info of page.imageinfo ?? []) {
      if (info.mime?.startsWith("image/") && info.thumburl) {
        candidates.push({ title, url: info.thumburl });
        break;
      }
    }
  }

  return pickBestScored(candidates, query);
}

async function searchOpenverse(query: string): Promise<string | null> {
  const url = new URL("https://api.openverse.org/v1/images/");
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "3");
  url.searchParams.set("mature", "false");

  const res = await fetchWithTimeout(url.toString(), OPENVERSE_TIMEOUT_MS, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; thumbnail?: string }>;
  };

  const candidates: Array<{ title: string; url: string }> = [];
  for (const hit of data.results ?? []) {
    const imageUrl = hit.thumbnail ?? hit.url;
    if (imageUrl) {
      candidates.push({ title: hit.title ?? query, url: imageUrl });
    }
  }

  return pickBestScored(candidates, query);
}

function cacheImage(query: string, imageUrl: string): void {
  const key = query.toLowerCase();
  if (imageCache.size >= CACHE_MAX) {
    const first = imageCache.keys().next().value;
    if (first) imageCache.delete(first);
  }
  imageCache.set(key, imageUrl);
}

async function searchVariant(query: string): Promise<string | null> {
  // Commons first — best for product/object photos; each source isolated.
  const commons = await safeSearch("commons", query, searchWikimediaCommons);
  if (commons) return commons;

  const wiki = await safeSearch("wikipedia", query, searchWikipedia);
  if (wiki) return wiki;

  return safeSearch("openverse", query, searchOpenverse);
}

async function resolveImageUrl(query: string): Promise<string | null> {
  const cached = imageCache.get(query.toLowerCase());
  if (cached) return cached;

  for (const variant of queryVariants(query)) {
    const imageUrl = await searchVariant(variant);
    if (imageUrl) {
      cacheImage(query, imageUrl);
      cacheImage(variant, imageUrl);
      return imageUrl;
    }
  }

  return null;
}

/** Resolve a real product photo URL for a find item (cached). */
export async function getFindItemImageUrl(
  item: FindCatalogItem,
): Promise<string | null> {
  const base = extractFindImageQuery(item.name);
  const searches = [base];

  const hint = CATEGORY_SEARCH_HINT[item.category];
  if (hint && !base.toLowerCase().includes(hint.split(" ")[0]!)) {
    searches.unshift(`${hint} ${base}`);
  }

  for (const query of searches) {
    const url = await resolveImageUrl(query);
    if (url) return url;
  }

  return null;
}
