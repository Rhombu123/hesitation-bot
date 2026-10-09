import { newId, supabase } from "../db/supabase.js";
import { BOOST_DAILY_LIMIT } from "../config/rolePrivileges.js";
import { utcDateString, utcWeekId } from "../utils/helpers.js";

/** Absolute ceiling (Mythic). Prefer `getDailyBoostLimit(member)` per giver. */
export const DAILY_BOOST_LIMIT = BOOST_DAILY_LIMIT.mythic;

export type RoleBoostTotal = {
  discordRoleId: string;
  ownerId: string;
  count: number;
};

export async function getDailyBoostsUsed(
  guildId: string,
  userId: string,
): Promise<number> {
  const date = utcDateString();
  const { data, error } = await supabase
    .from("DailyBoostGiven")
    .select("count")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`[supabase:getDailyBoostsUsed] ${error.message}`);
  return (data?.count as number | undefined) ?? 0;
}

export async function recordRoleBoost(opts: {
  guildId: string;
  fromUserId: string;
  toOwnerId: string;
  discordRoleId: string;
  amount?: number;
  /** Giver's daily cap from `getDailyBoostLimit`. */
  dailyLimit: number;
}): Promise<{ totalBoostsToRole: number }> {
  const dailyLimit = Math.max(1, opts.dailyLimit);
  const amount = Math.max(1, Math.min(opts.amount ?? 1, dailyLimit));
  const used = await getDailyBoostsUsed(opts.guildId, opts.fromUserId);
  if (used + amount > dailyLimit) {
    throw new Error("DAILY_LIMIT");
  }

  const date = utcDateString();
  const weekId = utcWeekId();

  const { data: daily, error: dailyReadErr } = await supabase
    .from("DailyBoostGiven")
    .select("id, count")
    .eq("guildId", opts.guildId)
    .eq("userId", opts.fromUserId)
    .eq("date", date)
    .maybeSingle();
  if (dailyReadErr) {
    throw new Error(`[supabase:recordRoleBoost.dailyRead] ${dailyReadErr.message}`);
  }

  if (daily) {
    const { error } = await supabase
      .from("DailyBoostGiven")
      .update({ count: (daily.count as number) + amount })
      .eq("id", daily.id as string);
    if (error) throw new Error(`[supabase:recordRoleBoost.dailyUpdate] ${error.message}`);
  } else {
    const { error } = await supabase.from("DailyBoostGiven").insert({
      id: newId(),
      guildId: opts.guildId,
      userId: opts.fromUserId,
      date,
      count: amount,
    });
    if (error) throw new Error(`[supabase:recordRoleBoost.dailyInsert] ${error.message}`);
  }

  for (let i = 0; i < amount; i++) {
    const { error } = await supabase.from("RoleBoost").insert({
      id: newId(),
      guildId: opts.guildId,
      fromUserId: opts.fromUserId,
      toOwnerId: opts.toOwnerId,
      discordRoleId: opts.discordRoleId,
      weekId,
    });
    if (error) throw new Error(`[supabase:recordRoleBoost.insert] ${error.message}`);
  }

  const totals = await getWeeklyBoostTotalsByRole(opts.guildId, weekId);
  const totalBoostsToRole =
    totals.find((t) => t.discordRoleId === opts.discordRoleId)?.count ?? amount;
  return { totalBoostsToRole };
}

export async function getWeeklyBoostTotalsByRole(
  guildId: string,
  weekId: string = utcWeekId(),
): Promise<RoleBoostTotal[]> {
  const { data, error } = await supabase
    .from("RoleBoost")
    .select("discordRoleId, toOwnerId")
    .eq("guildId", guildId)
    .eq("weekId", weekId);
  if (error) {
    throw new Error(`[supabase:getWeeklyBoostTotalsByRole] ${error.message}`);
  }

  const counts = new Map<string, { ownerId: string; count: number }>();
  for (const row of data ?? []) {
    const discordRoleId = row.discordRoleId as string;
    const ownerId = row.toOwnerId as string;
    const prev = counts.get(discordRoleId);
    if (prev) prev.count += 1;
    else counts.set(discordRoleId, { ownerId, count: 1 });
  }

  return [...counts.entries()]
    .map(([discordRoleId, v]) => ({
      discordRoleId,
      ownerId: v.ownerId,
      count: v.count,
    }))
    .sort((a, b) => b.count - a.count || a.discordRoleId.localeCompare(b.discordRoleId));
}

/** Supreme owner with the most boosts on their custom role in a completed UTC week. */
export async function getWeeklyBoostWinnerOwnerId(
  guildId: string,
  weekId: string,
): Promise<string | null> {
  const totals = await getWeeklyBoostTotalsByRole(guildId, weekId);
  if (totals.length === 0 || (totals[0]?.count ?? 0) <= 0) return null;

  const byOwner = new Map<string, number>();
  for (const row of totals) {
    byOwner.set(row.ownerId, (byOwner.get(row.ownerId) ?? 0) + row.count);
  }
  const sorted = [...byOwner.entries()].sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] ?? null;
}

/** Wipe boost rows for a completed week (called when Hesitation Ruler is crowned). */
export async function clearRoleBoostsForWeek(
  guildId: string,
  weekId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("RoleBoost")
    .delete()
    .eq("guildId", guildId)
    .eq("weekId", weekId)
    .select("id");
  if (error) {
    throw new Error(`[supabase:clearRoleBoostsForWeek] ${error.message}`);
  }
  return data?.length ?? 0;
}
