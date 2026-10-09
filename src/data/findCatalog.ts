import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type FindCategory =
  | "electronics"
  | "fashion"
  | "home"
  | "food"
  | "sports"
  | "beauty"
  | "toys"
  | "office"
  | "automotive"
  | "garden";

export type FindCatalogItem = {
  id: string;
  name: string;
  category: FindCategory;
  basePriceCents: number;
  imageUrl: string;
};

/** Max rolled treasure value ($1,000.00). */
export const FIND_TREASURE_MAX_CENTS = 100_000;

/** Legendary one-in-a-million style drop. */
export const LEGENDARY_MILLION_ITEM: FindCatalogItem = {
  id: "legendary-hesitation-crown-jewel",
  name: "Hesitation Crown Jewel (Legendary)",
  category: "fashion",
  basePriceCents: 100_000_000,
  imageUrl:
    "https://picsum.photos/seed/hesitation-crown-jewel-million/256/256",
};

/** Chance per `!find` to pull the $1M legendary (1 in 1,000,000). */
export const LEGENDARY_MILLION_CHANCE = 1 / 1_000_000;

const catalogPath = join(dirname(fileURLToPath(import.meta.url)), "find-catalog.json");
const ITEMS = JSON.parse(readFileSync(catalogPath, "utf8")) as FindCatalogItem[];

const byId = new Map<string, FindCatalogItem>(
  ITEMS.map((item) => [item.id, item]),
);

export function getCatalogSize(): number {
  return ITEMS.length;
}

export function getCatalogItemById(id: string): FindCatalogItem | null {
  return byId.get(id) ?? null;
}

export function getRandomCatalogItem(): FindCatalogItem {
  return ITEMS[Math.floor(Math.random() * ITEMS.length)]!;
}

/**
 * Roll a treasure value from $0.00–$1,000.00 (whole cents).
 * Uniform — every value in range is equally likely.
 */
export function rollFindTreasureValueCents(): number {
  return Math.floor(Math.random() * (FIND_TREASURE_MAX_CENTS + 1));
}

/** @deprecated Use rollFindTreasureValueCents — kept for scripts/tests. */
export function rollFindPrice(basePriceCents: number): number {
  void basePriceCents;
  return Math.max(1, rollFindTreasureValueCents());
}

export type FindRollResult = {
  item: FindCatalogItem;
  rolledPriceCents: number;
  legendary: boolean;
};

/** Pick catalog item + rolled value (includes ultra-rare $1M legendary). */
export function rollFindLoot(): FindRollResult {
  if (Math.random() < LEGENDARY_MILLION_CHANCE) {
    return {
      item: LEGENDARY_MILLION_ITEM,
      rolledPriceCents: LEGENDARY_MILLION_ITEM.basePriceCents,
      legendary: true,
    };
  }
  return {
    item: getRandomCatalogItem(),
    rolledPriceCents: rollFindTreasureValueCents(),
    legendary: false,
  };
}

export function formatFindUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Truncate long product names for embed fields. */
export function truncateItemName(name: string, max = 72): string {
  if (name.length <= max) return name;
  return `${name.slice(0, max - 1)}…`;
}
