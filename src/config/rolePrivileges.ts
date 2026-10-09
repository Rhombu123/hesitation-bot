import type { GuildMember } from "discord.js";
import { config, optionalEnv } from "../config.js";
import { ACTIONS } from "./actions.js";
import { isStaffMember } from "../utils/staff.js";

/**
 * Paid / loyalty roles — env vars override these defaults when set.
 * Empty string = not configured yet (role checks are skipped).
 */
export const ROLE_IDS = {
  loyal: optionalEnv("LOYAL_ROLE_ID") ?? "1515062746058592357",
  vip: optionalEnv("VIP_ROLE_ID") ?? "1533907906683080714",
  elite: optionalEnv("ELITE_ROLE_ID") ?? "1533907971929538572",
  supreme: optionalEnv("SUPREME_ROLE_ID") ?? "1533908093619015841",
  /** Crate / exclusive Mythic title — unlocks `!uwuify`. */
  mythic: optionalEnv("MYTHIC_ROLE_ID") ?? "1540805524033896469",
} as const;

/** Daily +rep/−rep allowance by tier (highest matching wins). */
export const REP_DAILY_LIMIT = {
  default: 3,
  vip: 4,
  /** Server boosters — 4 gives/day. */
  booster: 4,
  genius: 5,
  popular: 5,
  collector: 5,
  elite: 5,
  supreme: 12,
  /** Mythic inherits Supreme+ donor standing. */
  mythic: 12,
} as const;

/** Daily `!boost` allowance by tier (highest matching wins). */
export const BOOST_DAILY_LIMIT = {
  default: 1,
  vip: 3,
  elite: 5,
  supreme: 10,
  mythic: 26,
} as const;

/**
 * How many reputation points are applied per +rep / −rep give.
 * Matching bonuses **stack** (e.g. Supreme 24 + Booster 10 = 34).
 */
export const REP_GIVE_AMOUNT = {
  /** Server boosters — 10 rep per give. */
  booster: 10,
  vip: 6,
  elite: 7,
  genius: 12,
  popular: 12,
  collector: 12,
  supreme: 24,
  mythic: 24,
} as const;

/**
 * Free social actions — available to everyone (Loyal role removed).
 */
export const FREE_ACTIONS = [
  "slap",
  "kick",
  "pat",
  "bite",
  "cuddle",
  "bonk",
  "handhold",
  "hug",
  "dap",
] as const;

/** @deprecated Loyal removed — kept empty; was hug/dap (now in FREE_ACTIONS). */
export const LOYAL_ACTIONS = [] as const;

/**
 * Discord Server Boosters — kiss unlock (`!dap` / `!hug` are free for everyone).
 * highfive / poke / yeet stay as booster extras.
 */
export const BOOSTER_ACTIONS = [
  "kiss",
  "highfive",
  "poke",
  "yeet",
] as const;

/** Elite extras (+ free package). kiss also on booster. */
export const ELITE_ACTIONS = ["kiss", "kill", "bully"] as const;

function hasRoleId(member: GuildMember, roleId: string): boolean {
  if (!roleId) return false;
  return member.roles.cache.has(roleId);
}

function hasRoleNamed(member: GuildMember, name: string): boolean {
  const needle = name.toLowerCase();
  return member.roles.cache.some((r) => r.name.toLowerCase() === needle);
}

/** True if the member is currently boosting this server. */
export function isServerBooster(member: GuildMember): boolean {
  if (member.premiumSince != null) return true;
  const boosterRole = member.guild.roles.premiumSubscriberRole;
  return boosterRole ? member.roles.cache.has(boosterRole.id) : false;
}

export function hasLoyal(member: GuildMember): boolean {
  return hasRoleId(member, ROLE_IDS.loyal);
}

export function hasVip(member: GuildMember): boolean {
  return hasRoleId(member, ROLE_IDS.vip);
}

export function hasElite(member: GuildMember): boolean {
  return hasRoleId(member, ROLE_IDS.elite);
}

export function hasSupreme(member: GuildMember): boolean {
  return hasRoleId(member, ROLE_IDS.supreme);
}

export function hasMythic(member: GuildMember): boolean {
  return hasRoleId(member, ROLE_IDS.mythic);
}

/**
 * Supreme-tier donor access — Mythic includes everything Supreme unlocks
 * (custom roles, all GIF actions, freeform, quote, etc.).
 */
export function hasSupremeAccess(member: GuildMember): boolean {
  return hasSupreme(member) || hasMythic(member);
}

export function hasGenius(member: GuildMember): boolean {
  return hasRoleId(member, config.geniusRoleId);
}

export function hasPopular(member: GuildMember): boolean {
  return hasRoleId(member, config.popularRoleId);
}

export function hasCollector(member: GuildMember): boolean {
  if (config.collectorRoleId && hasRoleId(member, config.collectorRoleId)) {
    return true;
  }
  return hasRoleNamed(member, "Collector");
}

export function hasHesitationRuler(member: GuildMember): boolean {
  if (
    config.hesitationRulerRoleId &&
    hasRoleId(member, config.hesitationRulerRoleId)
  ) {
    return true;
  }
  return hasRoleNamed(member, "Hesitation Ruler");
}

/**
 * Users always allowed a gradient custom role (even without Hesitation Ruler).
 * Currently: permanent exception for a designated Supreme holder.
 */
export const CUSTOM_ROLE_GRADIENT_USER_IDS = new Set<string>([
  "1453443494411636913",
]);

/** Hesitation Ruler, or an allowlisted user — may set a gradient custom role. */
export function canUseCustomRoleGradient(member: GuildMember): boolean {
  if (CUSTOM_ROLE_GRADIENT_USER_IDS.has(member.id)) return true;
  return hasHesitationRuler(member);
}

/** Daily rep give limit for this member (max of matching tiers). */
export function getDailyRepLimit(
  member: GuildMember,
  giverLevel = 0,
): number {
  let limit: number = REP_DAILY_LIMIT.default;
  if (giverLevel >= config.repBoostLevel) {
    limit = Math.max(limit, config.repBoostDailyLimit);
  }
  if (isServerBooster(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.booster);
  }
  if (hasGenius(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.genius);
  }
  if (hasPopular(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.popular);
  }
  if (hasCollector(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.collector);
  }
  if (hasVip(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.vip);
  }
  if (hasElite(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.elite);
  }
  if (hasSupreme(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.supreme);
  }
  if (hasMythic(member)) {
    limit = Math.max(limit, REP_DAILY_LIMIT.mythic);
  }
  return limit;
}

/** Daily `!boost` give limit for this member (max of matching tiers). */
export function getDailyBoostLimit(member: GuildMember): number {
  let limit: number = BOOST_DAILY_LIMIT.default;
  if (hasVip(member)) {
    limit = Math.max(limit, BOOST_DAILY_LIMIT.vip);
  }
  if (hasElite(member)) {
    limit = Math.max(limit, BOOST_DAILY_LIMIT.elite);
  }
  if (hasSupreme(member)) {
    limit = Math.max(limit, BOOST_DAILY_LIMIT.supreme);
  }
  if (hasMythic(member)) {
    limit = Math.max(limit, BOOST_DAILY_LIMIT.mythic);
  }
  return limit;
}

/**
 * Absolute amount applied on one +rep / −rep.
 * All matching role bonuses stack; level-60+ amount stacks on +rep only.
 * Default (no bonuses) is 1.
 */
export function getRepGiveAmount(
  member: GuildMember,
  positive: boolean,
  giverLevel: number,
): number {
  let amount = 0;

  if (positive && giverLevel >= config.repBoostLevel) {
    amount += config.repBoostAmount;
  }
  if (isServerBooster(member)) {
    amount += REP_GIVE_AMOUNT.booster;
  }
  if (hasVip(member)) {
    amount += REP_GIVE_AMOUNT.vip;
  }
  if (hasElite(member)) {
    amount += REP_GIVE_AMOUNT.elite;
  }
  if (hasGenius(member)) {
    amount += REP_GIVE_AMOUNT.genius;
  }
  if (hasPopular(member)) {
    amount += REP_GIVE_AMOUNT.popular;
  }
  if (hasCollector(member)) {
    amount += REP_GIVE_AMOUNT.collector;
  }
  if (hasMythic(member)) {
    amount += REP_GIVE_AMOUNT.mythic;
  } else if (hasSupreme(member)) {
    amount += REP_GIVE_AMOUNT.supreme;
  }

  return amount > 0 ? amount : 1;
}

/** Level that unlocks every social action command. */
export const ALL_ACTIONS_LEVEL = 70;

/** Actions this member may use. Staff / Supreme / Mythic / level 70+ get everything. */
export function getAllowedActions(
  member: GuildMember,
  level = 0,
): ReadonlySet<string> {
  if (
    isStaffMember(member) ||
    hasSupremeAccess(member) ||
    level >= ALL_ACTIONS_LEVEL
  ) {
    return ALL_ACTION_NAMES;
  }

  const allowed = new Set<string>();

  // Base package — free for everyone
  for (const a of FREE_ACTIONS) allowed.add(a);

  if (hasElite(member)) {
    for (const a of ELITE_ACTIONS) allowed.add(a);
  }
  if (isServerBooster(member)) {
    for (const a of BOOSTER_ACTIONS) allowed.add(a);
  }

  return allowed;
}

export function canUseAction(
  member: GuildMember,
  actionName: string,
  level = 0,
): boolean {
  return getAllowedActions(member, level).has(actionName);
}

export type ActionGateTier = "booster" | "elite" | "supreme";

/** Lowest tier that unlocks this action (free actions never deny). */
export function getActionMinimumTier(actionName: string): ActionGateTier {
  // Booster before Elite so shared actions (e.g. kiss) show the lower gate.
  if ((BOOSTER_ACTIONS as readonly string[]).includes(actionName)) {
    return "booster";
  }
  if ((ELITE_ACTIONS as readonly string[]).includes(actionName)) {
    return "elite";
  }
  return "supreme";
}

/**
 * Socialize-style red deny embed: `You must have @Elite+ to run this command`
 * Resolves the live guild role so we never show @unknown-role.
 */
export function actionDeniedRequirement(
  actionName: string,
  member: GuildMember,
): string {
  const tier = getActionMinimumTier(actionName);
  const guild = member.guild;

  const mention = (roleId: string, fallbackName: string): string => {
    const byId = roleId ? guild.roles.cache.get(roleId) : undefined;
    if (byId) return `<@&${byId.id}>`;
    const byName = guild.roles.cache.find(
      (r) => r.name.toLowerCase() === fallbackName.toLowerCase(),
    );
    if (byName) return `<@&${byName.id}>`;
    return `**${fallbackName}**`;
  };

  if (tier === "elite") return mention(ROLE_IDS.elite, "Elite");
  if (tier === "supreme") return mention(ROLE_IDS.supreme, "Supreme");
  if (tier === "booster") {
    const boosterRole = guild.roles.premiumSubscriberRole;
    if (boosterRole) return `<@&${boosterRole.id}>`;
    const byName = guild.roles.cache.find((r) => /boost/i.test(r.name));
    if (byName) return `<@&${byName.id}>`;
    return "**Server Booster**";
  }
  return "**Supreme**";
}

/** All registered action names (Supreme / staff unlock). */
const ALL_ACTION_NAMES: ReadonlySet<string> = new Set(
  ACTIONS.map((a) => a.name),
);
