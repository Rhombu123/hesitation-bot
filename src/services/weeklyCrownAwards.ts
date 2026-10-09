import { supabase } from "../db/supabase.js";

export type WeeklyCrownAwardRow = {
  guildId: string;
  awardedWeekId: string;
  geniusId: string | null;
  popularId: string | null;
  collectorId: string | null;
  rulerId: string | null;
  awardedAt: string;
};

export async function getWeeklyCrownAward(
  guildId: string,
): Promise<WeeklyCrownAwardRow | null> {
  const { data, error } = await supabase
    .from("WeeklyCrownAward")
    .select("*")
    .eq("guildId", guildId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:getWeeklyCrownAward] ${error.message}`);
  }
  if (!data) return null;

  return {
    guildId: data.guildId as string,
    awardedWeekId: data.awardedWeekId as string,
    geniusId: (data.geniusId as string | null) ?? null,
    popularId: (data.popularId as string | null) ?? null,
    collectorId: (data.collectorId as string | null) ?? null,
    rulerId: (data.rulerId as string | null) ?? null,
    awardedAt: data.awardedAt as string,
  };
}

export async function upsertWeeklyCrownAward(
  guildId: string,
  row: {
    awardedWeekId: string;
    geniusId: string | null;
    popularId: string | null;
    collectorId: string | null;
    rulerId: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("WeeklyCrownAward").upsert(
    {
      guildId,
      awardedWeekId: row.awardedWeekId,
      geniusId: row.geniusId,
      popularId: row.popularId,
      collectorId: row.collectorId,
      rulerId: row.rulerId,
      awardedAt: new Date().toISOString(),
    },
    { onConflict: "guildId" },
  );

  if (error) {
    throw new Error(`[supabase:upsertWeeklyCrownAward] ${error.message}`);
  }
}

export async function saveFindWeeklyWinner(
  guildId: string,
  weekId: string,
  userId: string,
  totalCents: number,
): Promise<void> {
  const { error } = await supabase.from("FindWeeklyWinner").upsert(
    {
      guildId,
      weekId,
      userId,
      totalCents,
      savedAt: new Date().toISOString(),
    },
    { onConflict: "guildId,weekId" },
  );

  if (error) {
    throw new Error(`[supabase:saveFindWeeklyWinner] ${error.message}`);
  }
}

export async function getFindWeeklyWinner(
  guildId: string,
  weekId: string,
): Promise<{ userId: string; totalCents: number } | null> {
  const { data, error } = await supabase
    .from("FindWeeklyWinner")
    .select("userId, totalCents")
    .eq("guildId", guildId)
    .eq("weekId", weekId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:getFindWeeklyWinner] ${error.message}`);
  }
  if (!data) return null;

  return {
    userId: data.userId as string,
    totalCents: data.totalCents as number,
  };
}
