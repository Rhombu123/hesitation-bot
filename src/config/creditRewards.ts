import { randomInt } from "../utils/helpers.js";

/**
 * Level-up credit bands. On each level gained, roll uniformly in [min, max].
 * Band for levels 5–15 matches the product brief (15–35).
 */
export const LEVEL_CREDIT_BANDS: ReadonlyArray<{
  minLevel: number;
  maxLevel: number;
  minCredits: number;
  maxCredits: number;
}> = [
  { minLevel: 1, maxLevel: 4, minCredits: 5, maxCredits: 15 },
  { minLevel: 5, maxLevel: 15, minCredits: 15, maxCredits: 35 },
  { minLevel: 16, maxLevel: 25, minCredits: 30, maxCredits: 55 },
  { minLevel: 26, maxLevel: 35, minCredits: 50, maxCredits: 80 },
  { minLevel: 36, maxLevel: 45, minCredits: 65, maxCredits: 95 },
  { minLevel: 46, maxLevel: 55, minCredits: 80, maxCredits: 115 },
  { minLevel: 56, maxLevel: 65, minCredits: 95, maxCredits: 135 },
  { minLevel: 66, maxLevel: 75, minCredits: 110, maxCredits: 155 },
  { minLevel: 76, maxLevel: 85, minCredits: 130, maxCredits: 180 },
  { minLevel: 86, maxLevel: 100, minCredits: 150, maxCredits: 210 },
];

export function creditBandForLevel(
  level: number,
): { minCredits: number; maxCredits: number } | null {
  if (level < 1 || level > 100) return null;
  const band = LEVEL_CREDIT_BANDS.find(
    (b) => level >= b.minLevel && level <= b.maxLevel,
  );
  return band
    ? { minCredits: band.minCredits, maxCredits: band.maxCredits }
    : null;
}

/** Random credits for reaching a single level (0 if out of range). */
export function rollCreditsForLevel(level: number): number {
  const band = creditBandForLevel(level);
  if (!band) return 0;
  return randomInt(band.minCredits, band.maxCredits);
}

/**
 * Sum of random credit rolls for each level from `oldLevel + 1` … `newLevel`.
 */
export function rollCreditsForLevelUps(
  oldLevel: number,
  newLevel: number,
): number {
  let total = 0;
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    total += rollCreditsForLevel(lvl);
  }
  return total;
}

export type CrateRarity = "common" | "uncommon" | "rare" | "epic";

/** Custom crate emojis shown next to **Rarity:** in game embeds. */
export const CRATE_RARITY_EMOJI_IDS: Readonly<Record<CrateRarity, string>> = {
  common: "1533545637801365645",
  uncommon: "1536882702559608852",
  rare: "1536880298304868523",
  epic: "1536881920493748225",
};

/** `<:common:…> **Rarity:** Common` — matches the spawn-embed layout. */
export function formatCrateRarityLine(
  rarityId: CrateRarity,
  rarityLabel: string,
): string {
  const emojiId = CRATE_RARITY_EMOJI_IDS[rarityId];
  return `<:${rarityId}:${emojiId}> **Rarity:** ${rarityLabel}`;
}

export const CRATE_RARITIES: ReadonlyArray<{
  id: CrateRarity;
  label: string;
  /** Relative spawn weight (higher = more common). */
  weight: number;
  minCredits: number;
  maxCredits: number;
  color: number;
}> = [
  {
    id: "common",
    label: "Common",
    weight: 50,
    minCredits: 5,
    maxCredits: 8,
    color: 0x95a5a6,
  },
  {
    id: "uncommon",
    label: "Uncommon",
    weight: 30,
    minCredits: 9,
    maxCredits: 11,
    color: 0x2ecc71,
  },
  {
    id: "rare",
    label: "Rare",
    weight: 15,
    minCredits: 12,
    maxCredits: 16,
    color: 0x3498db,
  },
  {
    id: "epic",
    label: "Epic",
    weight: 5,
    minCredits: 25,
    maxCredits: 35,
    color: 0x9b59b6,
  },
];

export function pickCrateRarity(): (typeof CRATE_RARITIES)[number] {
  const total = CRATE_RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = randomInt(1, total);
  for (const rarity of CRATE_RARITIES) {
    roll -= rarity.weight;
    if (roll <= 0) return rarity;
  }
  return CRATE_RARITIES[0]!;
}

export function rollCrateCredits(
  rarity: (typeof CRATE_RARITIES)[number],
): number {
  return randomInt(rarity.minCredits, rarity.maxCredits);
}

/** Reputation reward rarities for crate / light games. */
export const REP_RARITIES: ReadonlyArray<{
  id: CrateRarity;
  label: string;
  weight: number;
  minRep: number;
  maxRep: number;
  color: number;
}> = [
  {
    id: "common",
    label: "Common",
    weight: 50,
    minRep: 1,
    maxRep: 4,
    color: 0x95a5a6,
  },
  {
    id: "uncommon",
    label: "Uncommon",
    weight: 30,
    minRep: 5,
    maxRep: 10,
    color: 0x2ecc71,
  },
  {
    id: "rare",
    label: "Rare",
    weight: 15,
    minRep: 10,
    maxRep: 17,
    color: 0x3498db,
  },
  {
    id: "epic",
    label: "Epic",
    weight: 5,
    minRep: 20,
    maxRep: 32,
    color: 0x9b59b6,
  },
];

export function pickRepRarity(): (typeof REP_RARITIES)[number] {
  const total = REP_RARITIES.reduce((s, r) => s + r.weight, 0);
  let roll = randomInt(1, total);
  for (const rarity of REP_RARITIES) {
    roll -= rarity.weight;
    if (roll <= 0) return rarity;
  }
  return REP_RARITIES[0]!;
}

export function rollRepReward(
  rarity: (typeof REP_RARITIES)[number],
): number {
  return randomInt(rarity.minRep, rarity.maxRep);
}
