/**
 * Ultra-rare game loot roles (Socialize-style).
 * Drop rates on each game win (see `lootDrops.ts`):
 * - Rare loot (Personality / Hobby / Colors): **0.5%** (1 in 200)
 * - Exclusive Titles: **0.25%** (1 in 400)
 *
 * `discordColor` is the Discord role accent (synced by name on bot ready).
 * Discord `roleId` is optional until roles are created in the server.
 */

export type LootCategory = "personality" | "hobby" | "color" | "title";

export type LootRarity = "rare" | "exclusive";

export type LootColorKind = "gradient" | "solid";

export type LootRoleDef = {
  /** Stable slug used in code / DB. */
  id: string;
  /** Display name for the Discord role. */
  name: string;
  category: LootCategory;
  rarity: LootRarity;
  /**
   * Relative weight when rolling a loot drop among loot roles.
   * Exclusive titles use a tiny weight vs other loot.
   */
  dropWeight: number;
  /** Square / swatch emoji shown in lists. */
  swatch: string;
  /** Discord role color (0xRRGGBB) — themed to the role name. */
  discordColor: number;
  /** Only for color roles. */
  colorKind?: LootColorKind;
  /** Discord role snowflake once created. */
  roleId?: string;
};

export const LOOT_CATEGORY_META: Record<
  LootCategory,
  { label: string; emoji: string; short: string }
> = {
  personality: { label: "Personality Roles", emoji: "🍃", short: "Personality" },
  hobby: { label: "Hobby Roles", emoji: "🎮", short: "Hobby" },
  color: { label: "Color Roles", emoji: "🎨", short: "Colors" },
  title: { label: "Exclusive Titles", emoji: "👑", short: "Titles" },
};

/** Non-exclusive loot roles share this weight. */
const RARE_WEIGHT = 100;
/** Exclusive titles — ~100× rarer than other loot. */
const EXCLUSIVE_WEIGHT = 1;

export const LOOT_PERSONALITY: readonly LootRoleDef[] = [
  { id: "happy", name: "Happy", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "😊", discordColor: 0xf1c40f },
  { id: "sad", name: "Sad", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "😢", discordColor: 0x5b8def },
  { id: "angry", name: "Angry", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "😠", discordColor: 0xe74c3c },
  { id: "gloomy", name: "Gloomy", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🌑", discordColor: 0x4a5568 },
  { id: "tempered", name: "Tempered", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🧊", discordColor: 0x7fd8d8 },
  { id: "chill", name: "Chill", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "😎", discordColor: 0x1abc9c },
  { id: "chaotic", name: "Chaotic", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🌪️", discordColor: 0xe91e63 },
  { id: "softspoken", name: "Softspoken", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🕊️", discordColor: 0xf8c8dc },
  { id: "bold", name: "Bold", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🔥", discordColor: 0xff5722 },
  { id: "mysterious", name: "Mysterious", category: "personality", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🕵️", discordColor: 0x5e35b1 },
];

export const LOOT_HOBBY: readonly LootRoleDef[] = [
  { id: "gamer", name: "Gamer", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🎮", discordColor: 0x7c4dff },
  { id: "musician", name: "Musician", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🎵", discordColor: 0x9b59b6 },
  { id: "artist", name: "Artist", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🎨", discordColor: 0xec407a },
  { id: "reader", name: "Reader", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "📚", discordColor: 0x8d6e63 },
  { id: "chef", name: "Chef", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🍳", discordColor: 0xff7043 },
  { id: "athlete", name: "Athlete", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🏃", discordColor: 0x2196f3 },
  { id: "photographer", name: "Photographer", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "📷", discordColor: 0x607d8b },
  { id: "anime", name: "Anime", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🎌", discordColor: 0xff80ab },
  { id: "traveler", name: "Traveler", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "✈️", discordColor: 0x4fc3f7 },
  { id: "coder", name: "Coder", category: "hobby", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "💻", discordColor: 0x00c853 },
];

/** Page 1 of Colors — 5 gradient roles (Discord uses a solid accent). */
export const LOOT_GRADIENT_COLORS: readonly LootRoleDef[] = [
  { id: "grad_light", name: "Light", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "⬜", colorKind: "gradient", discordColor: 0xf5f0e6 },
  { id: "grad_lavender", name: "Lavender", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟪", colorKind: "gradient", discordColor: 0xb39ddb },
  { id: "grad_rose", name: "Rose", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🌸", colorKind: "gradient", discordColor: 0xf48fb1 },
  { id: "grad_berry", name: "Berry", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟣", colorKind: "gradient", discordColor: 0x8e24aa },
  { id: "grad_sky", name: "Sky", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟦", colorKind: "gradient", discordColor: 0x81d4fa },
];

/** Page 2 of Colors — 10 solid roles. */
export const LOOT_SOLID_COLORS: readonly LootRoleDef[] = [
  { id: "solid_red", name: "Red", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🔴", colorKind: "solid", discordColor: 0xe53935 },
  { id: "solid_orange", name: "Orange", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟠", colorKind: "solid", discordColor: 0xfb8c00 },
  { id: "solid_yellow", name: "Yellow", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟡", colorKind: "solid", discordColor: 0xfdd835 },
  { id: "solid_green", name: "Green", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟢", colorKind: "solid", discordColor: 0x43a047 },
  { id: "solid_blue", name: "Blue", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🔵", colorKind: "solid", discordColor: 0x1e88e5 },
  { id: "solid_purple", name: "Purple", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🟣", colorKind: "solid", discordColor: 0x8e24aa },
  { id: "solid_pink", name: "Pink", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🩷", colorKind: "solid", discordColor: 0xec407a },
  { id: "solid_silver", name: "Silver", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "⬜", colorKind: "solid", discordColor: 0xb0bec5 },
  { id: "solid_black", name: "Black", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "⬛", colorKind: "solid", discordColor: 0x212121 },
  { id: "solid_white", name: "White", category: "color", rarity: "rare", dropWeight: RARE_WEIGHT, swatch: "🤍", colorKind: "solid", discordColor: 0xfafafa },
];

/** Extremely rare exclusive titles. */
export const LOOT_TITLES: readonly LootRoleDef[] = [
  { id: "phantom", name: "Phantom", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "👻", discordColor: 0x90a4ae },
  { id: "apex", name: "Apex", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "🏔️", discordColor: 0xffb300 },
  { id: "eclipse", name: "Eclipse", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "🌑", discordColor: 0x311b92 },
  { id: "neon", name: "Neon", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "💡", discordColor: 0x39ff14 },
  { id: "sovereign", name: "Sovereign", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "👑", discordColor: 0xffd700 },
  {
    id: "mystic",
    name: "Mystic",
    category: "title",
    rarity: "exclusive",
    dropWeight: EXCLUSIVE_WEIGHT,
    swatch: "✨",
    discordColor: 0xaa00ff,
    /** Fixed Discord role — do not create/match by the old "Mythic" name. */
    roleId: "1547744610984656966",
  },
  { id: "drift", name: "Drift", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "🌊", discordColor: 0x26c6da },
  { id: "pulse", name: "Pulse", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "💓", discordColor: 0xff1744 },
  { id: "vortex", name: "Vortex", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "🌀", discordColor: 0x7b1fa2 },
  { id: "ascendant", name: "Ascendant", category: "title", rarity: "exclusive", dropWeight: EXCLUSIVE_WEIGHT, swatch: "🚀", discordColor: 0x40c4ff },
];

export const LOOT_ROLES: Record<LootCategory, readonly LootRoleDef[]> = {
  personality: LOOT_PERSONALITY,
  hobby: LOOT_HOBBY,
  color: [...LOOT_GRADIENT_COLORS, ...LOOT_SOLID_COLORS],
  title: LOOT_TITLES,
};

/** Color pages for `!loot` Colors view: 0 = gradient, 1 = solid. */
export const LOOT_COLOR_PAGES: readonly {
  kind: LootColorKind;
  label: string;
  roles: readonly LootRoleDef[];
}[] = [
  { kind: "gradient", label: "Gradient", roles: LOOT_GRADIENT_COLORS },
  { kind: "solid", label: "Solid", roles: LOOT_SOLID_COLORS },
];

export function allLootRoles(): readonly LootRoleDef[] {
  return Object.values(LOOT_ROLES).flat();
}

export function lootRolesForCategory(
  category: LootCategory,
): readonly LootRoleDef[] {
  return LOOT_ROLES[category];
}

export function findLootRole(id: string): LootRoleDef | undefined {
  // Legacy unlock slug from when this title was named Mythic.
  const slug = id === "mythic" ? "mystic" : id;
  return allLootRoles().find((r) => r.id === slug);
}
