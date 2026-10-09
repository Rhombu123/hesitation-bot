import { newId, sql } from "../db/postgres.js";

export class InsufficientCreditsError extends Error {
  constructor() {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
  }
}

function balanceOf(row: Record<string, unknown> | undefined): number {
  return Number(row?.balance ?? 0);
}

/** Server credits balance (separate from currency points). */
export async function getOrCreateCredits(
  guildId: string,
  userId: string,
): Promise<number> {
  const existing = await sql`
    SELECT balance
    FROM "CreditsBalance"
    WHERE "guildId" = ${guildId} AND "userId" = ${userId}
    LIMIT 1
  `;
  if (existing[0]) return balanceOf(existing[0] as Record<string, unknown>);

  try {
    const inserted = await sql`
      INSERT INTO "CreditsBalance" ("id", "guildId", "userId", balance)
      VALUES (${newId()}, ${guildId}, ${userId}, 0)
      RETURNING balance
    `;
    return balanceOf(inserted[0] as Record<string, unknown>);
  } catch (err) {
    const again = await sql`
      SELECT balance
      FROM "CreditsBalance"
      WHERE "guildId" = ${guildId} AND "userId" = ${userId}
      LIMIT 1
    `;
    if (again[0]) return balanceOf(again[0] as Record<string, unknown>);
    throw err;
  }
}

/**
 * Add (or subtract) credits. Returns the new balance.
 * Prefer `spendCredits` for purchases (fails if balance is too low).
 */
export async function addCredits(
  guildId: string,
  userId: string,
  amount: number,
): Promise<number> {
  if (amount === 0) return getOrCreateCredits(guildId, userId);

  const rows = await sql`
    SELECT balance FROM add_credits(${guildId}, ${userId}, ${amount})
  `;
  return balanceOf(rows[0] as Record<string, unknown>);
}

/**
 * Atomically deduct credits. Throws InsufficientCreditsError if balance is too low.
 * Returns the new balance.
 */
export async function spendCredits(
  guildId: string,
  userId: string,
  amount: number,
): Promise<number> {
  if (amount <= 0) {
    throw new Error("spendCredits amount must be positive");
  }

  try {
    const rows = await sql`
      SELECT balance FROM spend_credits(${guildId}, ${userId}, ${amount})
    `;
    return balanceOf(rows[0] as Record<string, unknown>);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("insufficient_credits")) {
      throw new InsufficientCreditsError();
    }
    throw err;
  }
}
