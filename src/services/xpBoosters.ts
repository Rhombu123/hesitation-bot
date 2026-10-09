import type { Client } from "discord.js";
import { newId, supabase } from "../db/supabase.js";
import { reconcileBlessRoles, setBlessRole } from "./blessRole.js";

export const XP_BOOST_DURATION_MS = 24 * 60 * 60_000;
export const BLESS_BOOST_DURATION_MS = 60 * 60_000;

export type XpBoosterRow = {
  id: string;
  guildId: string;
  userId: string;
  expiresAt: string;
  grantedAt: string;
  active: boolean;
  multiplier: number;
  blessActive: boolean;
};

type CacheEntry = { expiresAtMs: number; multiplier: number };

/** guildId:userId → active boost cache. */
const cache = new Map<string, CacheEntry>();

function cacheKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function remember(row: XpBoosterRow): void {
  cache.set(cacheKey(row.guildId, row.userId), {
    expiresAtMs: new Date(row.expiresAt).getTime(),
    multiplier: Math.max(1, row.multiplier || 2),
  });
}

function forget(guildId: string, userId: string): void {
  cache.delete(cacheKey(guildId, userId));
}

function normalizeRow(raw: Record<string, unknown> | null): XpBoosterRow | null {
  if (!raw) return null;
  return {
    id: String(raw.id),
    guildId: String(raw.guildId),
    userId: String(raw.userId),
    expiresAt: String(raw.expiresAt),
    grantedAt: String(raw.grantedAt),
    active: Boolean(raw.active),
    multiplier: Math.max(1, Number(raw.multiplier ?? 2) || 2),
    blessActive: Boolean(raw.blessActive ?? false),
  };
}

export async function getActiveXpBooster(
  guildId: string,
  userId: string,
): Promise<XpBoosterRow | null> {
  const { data, error } = await supabase
    .from("XpBoosters")
    .select("*")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(`[supabase:getActiveXpBooster] ${error.message}`);
  const row = normalizeRow(data as Record<string, unknown> | null);
  if (!row) {
    forget(guildId, userId);
    return null;
  }
  if (new Date(row.expiresAt).getTime() <= Date.now()) {
    await deactivateXpBooster(guildId, userId);
    return null;
  }
  remember(row);
  return row;
}

/** Active XP multiplier (1 if none). */
export async function getXpMultiplier(
  guildId: string,
  userId: string,
): Promise<number> {
  const key = cacheKey(guildId, userId);
  const cached = cache.get(key);
  if (cached != null) {
    if (cached.expiresAtMs > Date.now()) return cached.multiplier;
    cache.delete(key);
  }

  const row = await getActiveXpBooster(guildId, userId);
  return row ? row.multiplier : 1;
}

async function readBoosterRow(
  guildId: string,
  userId: string,
): Promise<XpBoosterRow | null> {
  const { data, error } = await supabase
    .from("XpBoosters")
    .select("*")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();
  if (error) {
    throw new Error(`[supabase:xpBooster.read] ${error.message}`);
  }
  return normalizeRow(data as Record<string, unknown> | null);
}

async function upsertBooster(opts: {
  guildId: string;
  userId: string;
  expiresAt: string;
  multiplier: number;
  blessActive: boolean;
}): Promise<XpBoosterRow> {
  const prev = await readBoosterRow(opts.guildId, opts.userId);
  const grantedAt = new Date().toISOString();

  if (prev) {
    const { data, error } = await supabase
      .from("XpBoosters")
      .update({
        expiresAt: opts.expiresAt,
        grantedAt,
        active: true,
        multiplier: opts.multiplier,
        blessActive: opts.blessActive,
      })
      .eq("id", prev.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(`[supabase:xpBooster.update] ${error.message}`);
    }
    const row = normalizeRow(data as Record<string, unknown>)!;
    remember(row);
    return row;
  }

  const { data, error } = await supabase
    .from("XpBoosters")
    .insert({
      id: newId(),
      guildId: opts.guildId,
      userId: opts.userId,
      expiresAt: opts.expiresAt,
      active: true,
      multiplier: opts.multiplier,
      blessActive: opts.blessActive,
    })
    .select("*")
    .single();
  if (error) {
    throw new Error(`[supabase:xpBooster.insert] ${error.message}`);
  }
  const row = normalizeRow(data as Record<string, unknown>)!;
  remember(row);
  return row;
}

/**
 * Shop Double XP redeem.
 * - No active bless boost → normal 2× for 24h (extends from max(now, expiry)).
 * - Bless boost active → +1 hour only; mult = max(current, 2).
 */
export async function grantXpBooster(
  guildId: string,
  userId: string,
  durationMs = XP_BOOST_DURATION_MS,
): Promise<XpBoosterRow> {
  const now = Date.now();
  const active = await getActiveXpBooster(guildId, userId);

  if (active?.blessActive) {
    const expiresAt = new Date(
      new Date(active.expiresAt).getTime() + BLESS_BOOST_DURATION_MS,
    ).toISOString();
    return upsertBooster({
      guildId,
      userId,
      expiresAt,
      multiplier: Math.max(active.multiplier, 2),
      blessActive: true,
    });
  }

  const base =
    active && new Date(active.expiresAt).getTime() > now
      ? new Date(active.expiresAt).getTime()
      : now;
  const expiresAt = new Date(base + durationMs).toISOString();
  return upsertBooster({
    guildId,
    userId,
    expiresAt,
    multiplier: Math.max(active?.multiplier ?? 1, 2),
    blessActive: false,
  });
}

/**
 * Apply a bless: +1 hour duration, highest multiplier wins, marks blessActive.
 */
export async function grantBlessBoost(
  guildId: string,
  userId: string,
  multiplier: number,
): Promise<XpBoosterRow> {
  const now = Date.now();
  const active = await getActiveXpBooster(guildId, userId);
  const base =
    active && new Date(active.expiresAt).getTime() > now
      ? new Date(active.expiresAt).getTime()
      : now;
  const expiresAt = new Date(base + BLESS_BOOST_DURATION_MS).toISOString();
  const nextMult = Math.max(active?.multiplier ?? 1, multiplier);

  return upsertBooster({
    guildId,
    userId,
    expiresAt,
    multiplier: nextMult,
    blessActive: true,
  });
}

export async function deactivateXpBooster(
  guildId: string,
  userId: string,
): Promise<void> {
  const existing = await readBoosterRow(guildId, userId);
  const wasBless = Boolean(existing?.active && existing.blessActive);
  forget(guildId, userId);
  await supabase
    .from("XpBoosters")
    .update({ active: false, blessActive: false })
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("active", true);
  if (wasBless) await removeBlessRole(guildId, userId);
}

export async function processExpiredXpBoosters(): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("XpBoosters")
    .select("*")
    .eq("active", true)
    .lte("expiresAt", now);
  if (error) {
    throw new Error(`[supabase:processExpiredXpBoosters] ${error.message}`);
  }
  let n = 0;
  for (const raw of (data as Record<string, unknown>[]) ?? []) {
    const row = normalizeRow(raw);
    if (!row) continue;
    await deactivateXpBooster(row.guildId, row.userId);
    n += 1;
  }
  return n;
}

let expiryTimer: ReturnType<typeof setTimeout> | null = null;
let expiryInterval: ReturnType<typeof setInterval> | null = null;
let boosterClient: Client | null = null;

async function removeBlessRole(guildId: string, userId: string): Promise<void> {
  if (!boosterClient) return;
  const guild = await boosterClient.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;
  await setBlessRole(guild, userId, false).catch((err) =>
    console.warn(`[bless] Role remove failed for ${userId}:`, err),
  );
}

async function syncActiveBlessRoles(): Promise<void> {
  if (!boosterClient) return;
  const { data, error } = await supabase
    .from("XpBoosters")
    .select("*")
    .eq("active", true)
    .eq("blessActive", true);
  if (error) {
    throw new Error(`[supabase:syncActiveBlessRoles] ${error.message}`);
  }
  const now = Date.now();
  const byGuild = new Map<string, Set<string>>();
  for (const raw of (data as Record<string, unknown>[]) ?? []) {
    const row = normalizeRow(raw);
    if (!row || new Date(row.expiresAt).getTime() <= now) continue;
    const set = byGuild.get(row.guildId) ?? new Set<string>();
    set.add(row.userId);
    byGuild.set(row.guildId, set);
  }
  await reconcileBlessRoles(boosterClient, byGuild);
}

export function startXpBoosterExpiryTicker(client: Client): void {
  boosterClient = client;
  stopXpBoosterExpiryTicker();
  const run = () => {
    void processExpiredXpBoosters()
      .then(async (n) => {
        if (n > 0) console.log(`[xpBoost] Expired ${n} booster(s).`);
        await syncActiveBlessRoles();
      })
      .catch((err) => console.error("[xpBoost] Expiry tick failed:", err));
  };
  expiryTimer = setTimeout(() => {
    run();
    expiryInterval = setInterval(run, 15 * 60_000);
  }, 20_000);
  console.log("[xpBoost] Expiry ticker scheduled.");
}

export function stopXpBoosterExpiryTicker(): void {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
  if (expiryInterval) {
    clearInterval(expiryInterval);
    expiryInterval = null;
  }
}
