import { sql } from "../db/postgres.js";

export type BumpReminderRow = {
  guildId: string;
  nextReminderAt: string;
};

export async function upsertBumpReminder(
  guildId: string,
  nextReminderAt: Date,
): Promise<void> {
  await sql`
    INSERT INTO "BumpReminderState" ("guildId", "nextReminderAt", "updatedAt")
    VALUES (${guildId}, ${nextReminderAt.toISOString()}, ${new Date().toISOString()})
    ON CONFLICT ("guildId")
    DO UPDATE SET
      "nextReminderAt" = EXCLUDED."nextReminderAt",
      "updatedAt" = EXCLUDED."updatedAt"
  `;
}

export async function deleteBumpReminder(guildId: string): Promise<void> {
  await sql`
    DELETE FROM "BumpReminderState"
    WHERE "guildId" = ${guildId}
  `;
}

export async function listBumpReminders(): Promise<BumpReminderRow[]> {
  const rows = await sql`
    SELECT "guildId", "nextReminderAt"
    FROM "BumpReminderState"
  `;
  return rows.map((r) => ({
    guildId: String(r.guildId),
    nextReminderAt: new Date(r.nextReminderAt as string | Date).toISOString(),
  }));
}
