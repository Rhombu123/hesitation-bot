import type { GuildMember } from "discord.js";
import { newId, supabase } from "../db/supabase.js";
import {
  hasElite,
  hasMythic,
  hasSupreme,
  hasVip,
} from "../config/rolePrivileges.js";
import { utcDateString } from "../utils/helpers.js";

export type BlessTier = {
  key: "vip" | "elite" | "supreme" | "mythic";
  label: string;
  name: string;
  multiplier: number;
  dailyLimit: number;
};

/** Highest owned donor role wins (not additive). */
export function getBlessTier(member: GuildMember): BlessTier | null {
  if (hasMythic(member)) {
    return {
      key: "mythic",
      label: "Mythic",
      name: "Huge blessing",
      multiplier: 10,
      dailyLimit: 15,
    };
  }
  if (hasSupreme(member)) {
    return {
      key: "supreme",
      label: "Supreme",
      name: "Large blessing",
      multiplier: 5,
      dailyLimit: 10,
    };
  }
  if (hasElite(member)) {
    return {
      key: "elite",
      label: "Elite",
      name: "Medium blessing",
      multiplier: 3,
      dailyLimit: 5,
    };
  }
  if (hasVip(member)) {
    return {
      key: "vip",
      label: "VIP",
      name: "Small blessing",
      multiplier: 2,
      dailyLimit: 3,
    };
  }
  return null;
}

export async function getDailyBlessesUsed(
  guildId: string,
  userId: string,
): Promise<number> {
  const date = utcDateString();
  const { data, error } = await supabase
    .from("DailyBlessGiven")
    .select("count")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(`[supabase:getDailyBlessesUsed] ${error.message}`);
  return (data?.count as number | undefined) ?? 0;
}

export async function consumeDailyBless(opts: {
  guildId: string;
  userId: string;
  limit: number;
}): Promise<{ used: number; left: number }> {
  const used = await getDailyBlessesUsed(opts.guildId, opts.userId);
  if (used >= opts.limit) {
    throw new Error("DAILY_LIMIT");
  }

  const date = utcDateString();
  const { data: daily, error: dailyReadErr } = await supabase
    .from("DailyBlessGiven")
    .select("id, count")
    .eq("guildId", opts.guildId)
    .eq("userId", opts.userId)
    .eq("date", date)
    .maybeSingle();
  if (dailyReadErr) {
    throw new Error(`[supabase:consumeDailyBless.read] ${dailyReadErr.message}`);
  }

  const next = used + 1;
  if (daily) {
    const { error } = await supabase
      .from("DailyBlessGiven")
      .update({ count: next })
      .eq("id", daily.id as string);
    if (error) {
      throw new Error(`[supabase:consumeDailyBless.update] ${error.message}`);
    }
  } else {
    const { error } = await supabase.from("DailyBlessGiven").insert({
      id: newId(),
      guildId: opts.guildId,
      userId: opts.userId,
      date,
      count: 1,
    });
    if (error) {
      throw new Error(`[supabase:consumeDailyBless.insert] ${error.message}`);
    }
  }

  return { used: next, left: Math.max(0, opts.limit - next) };
}

export function blessTargetCooldownKey(
  guildId: string,
  fromUserId: string,
  toUserId: string,
): string {
  return `cd:bless:${guildId}:${fromUserId}:${toUserId}`;
}

export const BLESS_TARGET_COOLDOWN_MS = 24 * 60 * 60_000;
