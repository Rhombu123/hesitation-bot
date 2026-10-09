import { newId, sql } from "../db/postgres.js";
import { utcWeekId } from "../utils/helpers.js";
import { queueWeeklyBoardRefresh } from "./weeklyRoleQueue.js";

/** Server currency balance (separate from XP and reputation). */
export async function getOrCreateBalance(
  guildId: string,
  userId: string,
): Promise<number> {
  const existing = await sql`
    SELECT "balance" FROM "CurrencyBalance"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
    LIMIT 1
  `;
  if (existing[0]) return Number(existing[0].balance);

  try {
    const inserted = await sql`
      INSERT INTO "CurrencyBalance" ("id", "guildId", "userId", "balance")
      VALUES (${newId()}, ${guildId}, ${userId}, 0)
      RETURNING "balance"
    `;
    return Number(inserted[0]!.balance);
  } catch {
    const again = await sql`
      SELECT "balance" FROM "CurrencyBalance"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      LIMIT 1
    `;
    if (again[0]) return Number(again[0].balance);
    throw new Error("[pg:getOrCreateBalance] missing after race");
  }
}

async function addWeeklyPoints(
  guildId: string,
  userId: string,
  amount: number,
): Promise<void> {
  if (amount === 0) return;
  const weekId = utcWeekId();
  await sql`SELECT add_weekly_currency(${guildId}, ${userId}, ${weekId}, ${amount})`;
}

/** Add (or subtract) currency points. Returns the new all-time balance. */
export async function addCurrency(
  guildId: string,
  userId: string,
  amount: number,
): Promise<number> {
  if (amount === 0) return getOrCreateBalance(guildId, userId);

  const rows = await sql`
    SELECT "balance" FROM add_currency(${guildId}, ${userId}, ${amount})
  `;
  const balance = Number(rows[0]?.balance ?? 0);

  if (amount > 0) {
    await addWeeklyPoints(guildId, userId, amount);
    queueWeeklyBoardRefresh("genius");
  }

  return balance;
}

/** 1-based all-time rank by currency balance. */
export async function getCurrencyRank(
  guildId: string,
  userId: string,
): Promise<number> {
  const balance = await getOrCreateBalance(guildId, userId);
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM "CurrencyBalance"
    WHERE "guildId" = ${guildId} AND "balance" > ${balance}
  `;
  return Number(rows[0]?.count ?? 0) + 1;
}

/** Weekly points for this UTC week (0 if none). */
export async function getWeeklyPoints(
  guildId: string,
  userId: string,
): Promise<number> {
  const weekId = utcWeekId();
  const rows = await sql`
    SELECT "points" FROM "CurrencyWeekly"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId} AND "weekId" = ${weekId}
    LIMIT 1
  `;
  return Number(rows[0]?.points ?? 0);
}

/** 1-based weekly rank by points (null if no weekly points). */
export async function getWeeklyPointsRank(
  guildId: string,
  userId: string,
): Promise<number | null> {
  const weekId = utcWeekId();
  const mine = await getWeeklyPoints(guildId, userId);
  if (mine <= 0) return null;

  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM "CurrencyWeekly"
    WHERE "guildId" = ${guildId} AND "weekId" = ${weekId} AND "points" > ${mine}
  `;
  return Number(rows[0]?.count ?? 0) + 1;
}

export async function getWeeklyPointsTop(
  guildId: string,
  limit = 10,
  weekId: string = utcWeekId(),
): Promise<Array<{ userId: string; points: number }>> {
  const rows = await sql`
    SELECT "userId", "points"
    FROM "CurrencyWeekly"
    WHERE "guildId" = ${guildId} AND "weekId" = ${weekId}
    ORDER BY "points" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    points: Number(r.points),
  }));
}

/** Top all-time currency balances (game points). */
export async function getAllTimePointsTop(
  guildId: string,
  limit = 10,
): Promise<Array<{ userId: string; points: number }>> {
  const rows = await sql`
    SELECT "userId", "balance"
    FROM "CurrencyBalance"
    WHERE "guildId" = ${guildId} AND "balance" > 0
    ORDER BY "balance" DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    userId: String(r.userId),
    points: Number(r.balance),
  }));
}
