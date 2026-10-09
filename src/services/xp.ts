import type { Client, GuildMember } from "discord.js";
import { config, MAIN_SERVER_XP_ONLY_USER_IDS } from "../config.js";
import { newId, sql } from "../db/postgres.js";
import { getAppealsGuildId, isAppealsGuild } from "../utils/appealsGuild.js";
import { levelFromXp } from "../utils/levelFormula.js";
import { announceLevelUp } from "./levelUp.js";
import { grantLevelRoles } from "./levelRoles.js";
import { getXpMultiplier } from "./xpBoosters.js";

export type UserStatsRow = {
  id: string;
  guildId: string;
  userId: string;
  xp: number;
  level: number;
  totalMessages: number;
};

/** Cached main guild id (env or resolved from games channel). */
let resolvedMainGuildId: string | null = config.mainGuildId ?? null;

function mapStats(row: Record<string, unknown>): UserStatsRow {
  return {
    id: String(row.id),
    guildId: String(row.guildId ?? row.guildid),
    userId: String(row.userId ?? row.userid),
    xp: Number(row.xp ?? 0),
    level: Number(row.level ?? 0),
    totalMessages: Number(row.totalMessages ?? row.totalmessages ?? 0),
  };
}

/**
 * Hesitation main server id — for XP locks and other main-guild-only rules.
 */
export async function getMainGuildId(client: Client): Promise<string | null> {
  if (resolvedMainGuildId) return resolvedMainGuildId;
  if (config.mainGuildId) {
    resolvedMainGuildId = config.mainGuildId;
    return resolvedMainGuildId;
  }
  const channel = await client.channels
    .fetch(config.gamesChannelId)
    .catch(() => null);
  if (channel && "guildId" in channel && typeof channel.guildId === "string") {
    resolvedMainGuildId = channel.guildId;
    return resolvedMainGuildId;
  }
  return null;
}

async function isXpBlockedOutsideMainServer(
  client: Client,
  guildId: string,
  userId: string,
): Promise<boolean> {
  if (!MAIN_SERVER_XP_ONLY_USER_IDS.has(userId)) return false;
  const main = await getMainGuildId(client);
  if (!main) {
    console.warn(
      `[xp] MAIN_SERVER_XP_ONLY user ${userId} — could not resolve main guild; allowing XP`,
    );
    return false;
  }
  return guildId !== main;
}

export async function getOrCreateStats(
  guildId: string,
  userId: string,
): Promise<UserStatsRow> {
  const existing = await sql`
    SELECT * FROM "UserStats"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
    LIMIT 1
  `;
  if (existing[0]) return mapStats(existing[0] as Record<string, unknown>);

  try {
    const inserted = await sql`
      INSERT INTO "UserStats" ("id", "guildId", "userId", "xp", "level", "totalMessages")
      VALUES (${newId()}, ${guildId}, ${userId}, 0, 0, 0)
      RETURNING *
    `;
    return mapStats(inserted[0] as Record<string, unknown>);
  } catch (err) {
    const again = await sql`
      SELECT * FROM "UserStats"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      LIMIT 1
    `;
    if (again[0]) return mapStats(again[0] as Record<string, unknown>);
    throw err;
  }
}

/**
 * Add XP (increment) and sync level. Returns levels gained (0 if none).
 */
export async function addXp(
  client: Client,
  guildId: string,
  userId: string,
  amount: number,
  member?: GuildMember | null,
): Promise<{ xp: number; level: number; levelsGained: number }> {
  const appealsId = await getAppealsGuildId(client);
  if ((appealsId && guildId === appealsId) || isAppealsGuild(guildId)) {
    const stats = await getOrCreateStats(guildId, userId);
    return { xp: stats.xp, level: stats.level, levelsGained: 0 };
  }

  if (await isXpBlockedOutsideMainServer(client, guildId, userId)) {
    const stats = await getOrCreateStats(guildId, userId);
    return { xp: stats.xp, level: stats.level, levelsGained: 0 };
  }

  if (amount <= 0) {
    const stats = await getOrCreateStats(guildId, userId);
    return { xp: stats.xp, level: stats.level, levelsGained: 0 };
  }

  let award = amount;
  try {
    const mult = await getXpMultiplier(guildId, userId);
    award = amount * mult;
  } catch (err) {
    console.warn("[xp] XP multiplier check failed — awarding base XP:", err);
  }

  const rows = await sql`
    SELECT * FROM add_user_xp(${guildId}, ${userId}, ${award})
  `;
  const updated = mapStats(rows[0] as Record<string, unknown>);

  const newLevel = levelFromXp(updated.xp);
  const levelsGained = Math.max(0, newLevel - updated.level);
  const oldLevel = updated.level;

  if (newLevel !== updated.level) {
    await sql`
      UPDATE "UserStats"
      SET "level" = ${newLevel}
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
    `;
  }

  if (levelsGained > 0) {
    const grantedRoles = await grantLevelRoles(client, {
      guildId,
      userId,
      oldLevel,
      newLevel,
      member: member ?? null,
    });
    await announceLevelUp(client, {
      guildId,
      userId,
      levelsGained,
      newLevel,
      oldLevel,
      member: member ?? null,
      grantedRoles,
    });
  }

  return { xp: updated.xp, level: newLevel, levelsGained };
}

/**
 * Remove XP (floored at 0) and sync level downward. Does not strip level roles
 * or announce level-downs.
 */
export async function removeXp(
  guildId: string,
  userId: string,
  amount: number,
): Promise<{ xp: number; level: number; removed: number }> {
  const stats = await getOrCreateStats(guildId, userId);
  if (amount <= 0) {
    return { xp: stats.xp, level: stats.level, removed: 0 };
  }

  const removed = Math.min(amount, stats.xp);
  const newXp = stats.xp - removed;
  const newLevel = levelFromXp(newXp);

  await sql`
    UPDATE "UserStats"
    SET "xp" = ${newXp}, "level" = ${newLevel}
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
  `;

  return { xp: newXp, level: newLevel, removed };
}

/**
 * Recompute stored `level` from total XP for every row.
 * Used after curve changes so DB levels match Arcane-style formula.
 */
export async function resyncAllLevelsFromXp(): Promise<number> {
  const rows = await sql`SELECT "id", "xp", "level" FROM "UserStats"`;
  let updated = 0;
  for (const row of rows) {
    const level = levelFromXp(Number(row.xp));
    if (level === Number(row.level)) continue;
    await sql`UPDATE "UserStats" SET "level" = ${level} WHERE "id" = ${row.id as string}`;
    updated += 1;
  }
  return updated;
}

export async function incrementTotalMessages(
  guildId: string,
  userId: string,
): Promise<void> {
  await sql`SELECT increment_total_messages(${guildId}, ${userId})`;
}

/** Top users by level (XP as tiebreaker) for a guild. */
export async function getTopByLevel(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; level: number; xp: number }>> {
  const rows = await sql`
    SELECT "userId", "level", "xp"
    FROM "UserStats"
    WHERE "guildId" = ${guildId}
    ORDER BY "level" DESC, "xp" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    level: Number(r.level),
    xp: Number(r.xp),
  }));
}
