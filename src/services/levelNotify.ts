import { newId, supabase } from "../db/supabase.js";

export type LevelNotifyPrefs = {
  serverEnabled: boolean;
  dmEnabled: boolean;
};

const DEFAULTS: LevelNotifyPrefs = {
  serverEnabled: true,
  dmEnabled: true,
};

/** Missing row / table → both notifications on. */
export async function getLevelNotifyPrefs(
  guildId: string,
  userId: string,
): Promise<LevelNotifyPrefs> {
  const { data, error } = await supabase
    .from("LevelNotifyPrefs")
    .select("serverEnabled, dmEnabled")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();

  if (error) {
    console.warn(`[levelNotify] get failed (${error.message}) — defaults on`);
    return { ...DEFAULTS };
  }
  if (!data) return { ...DEFAULTS };
  return {
    serverEnabled: data.serverEnabled !== false,
    dmEnabled: data.dmEnabled !== false,
  };
}

export async function setLevelNotifyPref(
  guildId: string,
  userId: string,
  patch: Partial<LevelNotifyPrefs>,
): Promise<LevelNotifyPrefs> {
  const current = await getLevelNotifyPrefs(guildId, userId);
  const next: LevelNotifyPrefs = {
    serverEnabled: patch.serverEnabled ?? current.serverEnabled,
    dmEnabled: patch.dmEnabled ?? current.dmEnabled,
  };

  const existing = await supabase
    .from("LevelNotifyPrefs")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`[levelNotify] lookup failed: ${existing.error.message}`);
  }

  if (existing.data) {
    const res = await supabase
      .from("LevelNotifyPrefs")
      .update({
        serverEnabled: next.serverEnabled,
        dmEnabled: next.dmEnabled,
        updatedAt: new Date().toISOString(),
      })
      .eq("id", existing.data.id as string)
      .select("serverEnabled, dmEnabled")
      .single();
    if (res.error) {
      throw new Error(`[levelNotify] update failed: ${res.error.message}`);
    }
    return {
      serverEnabled: res.data.serverEnabled !== false,
      dmEnabled: res.data.dmEnabled !== false,
    };
  }

  const res = await supabase
    .from("LevelNotifyPrefs")
    .insert({
      id: newId(),
      guildId,
      userId,
      serverEnabled: next.serverEnabled,
      dmEnabled: next.dmEnabled,
    })
    .select("serverEnabled, dmEnabled")
    .single();

  if (res.error) {
    throw new Error(`[levelNotify] insert failed: ${res.error.message}`);
  }
  return {
    serverEnabled: res.data.serverEnabled !== false,
    dmEnabled: res.data.dmEnabled !== false,
  };
}
