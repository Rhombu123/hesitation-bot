import { newId, sql } from "../db/postgres.js";
import {
  claimCooldownMs,
  cooldownRemainingMs,
} from "../db/redis.js";
import type { FindCatalogItem } from "../data/findCatalog.js";
import { utcWeekId } from "../utils/helpers.js";
import { saveFindWeeklyWinner } from "./weeklyCrownAwards.js";

export const FIND_COOLDOWN_MS = 15 * 60_000;
const PAGE_SIZE = 10;

export type FindInventoryRow = {
  id: string;
  guildId: string;
  userId: string;
  itemId: string;
  itemName: string;
  category: string;
  rolledPriceCents: number;
  basePriceCents: number;
  imageUrl: string;
  foundAt: string;
  weekId: string;
};

export type FindCooldownResult =
  | { ok: true }
  | { ok: false; retryInMs: number };

export type ValueLeaderRow = {
  userId: string;
  totalCents: number;
};

/** Per-process lock so overlapping !find never double-replies while image lookup runs. */
const findInFlight = new Set<string>();

function findLockKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function findCooldownRedisKey(guildId: string, userId: string): string {
  return `cd:find:${guildId}:${userId}`;
}

export function releaseFindInFlight(guildId: string, userId: string): void {
  findInFlight.delete(findLockKey(guildId, userId));
}

export async function checkFindCooldown(
  guildId: string,
  userId: string,
): Promise<FindCooldownResult> {
  const remaining = await cooldownRemainingMs(
    findCooldownRedisKey(guildId, userId),
  );
  if (remaining > 0) return { ok: false, retryInMs: remaining };
  return { ok: true };
}

/**
 * Atomically claim a find slot via Redis (shared across replicas).
 * Call `releaseFindInFlight` in a finally when done (success or fail after claim).
 */
export async function claimFindCooldown(
  guildId: string,
  userId: string,
): Promise<FindCooldownResult> {
  const key = findLockKey(guildId, userId);
  if (findInFlight.has(key)) {
    const existing = await checkFindCooldown(guildId, userId);
    if (!existing.ok) return existing;
    return { ok: false, retryInMs: FIND_COOLDOWN_MS };
  }
  findInFlight.add(key);

  const claim = await claimCooldownMs(
    findCooldownRedisKey(guildId, userId),
    FIND_COOLDOWN_MS,
  );
  if (!claim.ok) {
    findInFlight.delete(key);
    return claim;
  }

  // Best-effort durable marker (Redis is the source of truth for the timer).
  void sql`
    INSERT INTO "FindCooldown" ("id", "guildId", "userId", "lastFindAt")
    VALUES (${newId()}, ${guildId}, ${userId}, ${new Date().toISOString()})
    ON CONFLICT ("guildId", "userId")
    DO UPDATE SET "lastFindAt" = EXCLUDED."lastFindAt"
  `.catch((err) =>
    console.warn("[find] FindCooldown upsert failed:", err),
  );

  return { ok: true };
}

export async function recordFind(opts: {
  guildId: string;
  userId: string;
  item: FindCatalogItem;
  rolledPriceCents: number;
}): Promise<FindInventoryRow> {
  const weekId = utcWeekId();
  const row: FindInventoryRow = {
    id: newId(),
    guildId: opts.guildId,
    userId: opts.userId,
    itemId: opts.item.id,
    itemName: opts.item.name,
    category: opts.item.category,
    rolledPriceCents: opts.rolledPriceCents,
    basePriceCents: opts.item.basePriceCents,
    imageUrl: opts.item.imageUrl,
    foundAt: new Date().toISOString(),
    weekId,
  };

  const inserted = await sql`
    INSERT INTO "FindInventory" (
      "id", "guildId", "userId", "itemId", "itemName", "category",
      "rolledPriceCents", "basePriceCents", "imageUrl", "foundAt", "weekId"
    ) VALUES (
      ${row.id}, ${row.guildId}, ${row.userId}, ${row.itemId}, ${row.itemName},
      ${row.category}, ${row.rolledPriceCents}, ${row.basePriceCents},
      ${row.imageUrl}, ${row.foundAt}, ${row.weekId}
    )
    RETURNING *
  `;

  const out = inserted[0] as Record<string, unknown>;
  const recorded: FindInventoryRow = {
    id: String(out.id),
    guildId: String(out.guildId),
    userId: String(out.userId),
    itemId: String(out.itemId),
    itemName: String(out.itemName),
    category: String(out.category),
    rolledPriceCents: Number(out.rolledPriceCents),
    basePriceCents: Number(out.basePriceCents),
    imageUrl: String(out.imageUrl),
    foundAt: String(out.foundAt),
    weekId: String(out.weekId),
  };

  // Keep a durable #1 snapshot (collective week total) for Monday awards.
  void snapshotWeeklyFindLeader(opts.guildId, weekId).catch((err) =>
    console.warn("[find] Weekly leader snapshot failed:", err),
  );

  return recorded;
}

/** Delete finds from prior UTC weeks (Monday 00:00 UTC reset). */
export async function clearFindInventoryNotInWeek(
  weekId = utcWeekId(),
): Promise<number> {
  const deleted = await sql`
    DELETE FROM "FindInventory"
    WHERE "weekId" <> ${weekId}
    RETURNING "id"
  `;
  return deleted.length;
}

export async function getUserInventoryPage(
  guildId: string,
  userId: string,
  page = 1,
): Promise<{
  items: FindInventoryRow[];
  totalCount: number;
  totalValueCents: number;
  page: number;
  pageCount: number;
}> {
  const safePage = Math.max(1, page);
  const offset = (safePage - 1) * PAGE_SIZE;
  const weekId = utcWeekId();

  const [items, totals] = await Promise.all([
    sql`
      SELECT * FROM "FindInventory"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId} AND "weekId" = ${weekId}
      ORDER BY "foundAt" DESC
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `,
    sql`
      SELECT COUNT(*)::int AS count, COALESCE(SUM("rolledPriceCents"), 0)::bigint AS sum
      FROM "FindInventory"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId} AND "weekId" = ${weekId}
    `,
  ]);

  const totalCount = Number(totals[0]?.count ?? 0);
  const totalValueCents = Number(totals[0]?.sum ?? 0);

  return {
    items: items.map((out) => ({
      id: String(out.id),
      guildId: String(out.guildId),
      userId: String(out.userId),
      itemId: String(out.itemId),
      itemName: String(out.itemName),
      category: String(out.category),
      rolledPriceCents: Number(out.rolledPriceCents),
      basePriceCents: Number(out.basePriceCents),
      imageUrl: String(out.imageUrl),
      foundAt: String(out.foundAt),
      weekId: String(out.weekId),
    })),
    totalCount,
    totalValueCents,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
  };
}

export async function getWeeklyValueList(
  guildId: string,
  weekId = utcWeekId(),
): Promise<ValueLeaderRow[]> {
  // Collective (summed) find value for the week — not highest single find.
  const data = await sql`
    SELECT
      "userId",
      COALESCE(SUM("rolledPriceCents"), 0)::bigint AS "totalCents"
    FROM "FindInventory"
    WHERE "guildId" = ${guildId} AND "weekId" = ${weekId}
    GROUP BY "userId"
    ORDER BY "totalCents" DESC, "userId" ASC
  `;
  return data.map((r) => ({
    userId: String(r.userId),
    totalCents: Number(r.totalCents) || 0,
  }));
}

/** Persist current #1 by collective find $ so Monday award survives inventory clears. */
export async function snapshotWeeklyFindLeader(
  guildId: string,
  weekId = utcWeekId(),
): Promise<ValueLeaderRow | null> {
  const top = (await getWeeklyValueList(guildId, weekId))[0] ?? null;
  if (!top) return null;
  await saveFindWeeklyWinner(guildId, weekId, top.userId, top.totalCents);
  return top;
}

export async function getWeeklyValueTop(
  guildId: string,
  limit = 10,
  weekId = utcWeekId(),
): Promise<ValueLeaderRow[]> {
  return (await getWeeklyValueList(guildId, weekId)).slice(0, limit);
}

export async function getUserWeeklyRank(
  guildId: string,
  userId: string,
  weekId = utcWeekId(),
): Promise<number | null> {
  const rows = await getWeeklyValueList(guildId, weekId);
  const idx = rows.findIndex((r) => r.userId === userId);
  return idx >= 0 ? idx + 1 : null;
}

export function formatFindCooldown(ms: number): string {
  if (ms < 60_000) {
    const s = Math.ceil(ms / 1_000);
    return `${s} second${s === 1 ? "" : "s"}`;
  }
  const mins = Math.ceil(ms / 60_000);
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}
