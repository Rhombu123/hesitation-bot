import { newId, supabase } from "../db/supabase.js";

/**
 * Fetch loot role IDs unlocked by a user in a guild.
 * Missing table / errors → empty set (UI still works).
 */
export async function getUnlockedLootIds(
  guildId: string,
  userId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("UserLootUnlocks")
    .select("lootId")
    .eq("guildId", guildId)
    .eq("userId", userId);

  if (error) {
    console.warn(`[loot] getUnlocked failed (${error.message}) — empty`);
    return new Set();
  }
  return new Set(
    (data ?? []).map((row) => {
      const id = String(row.lootId);
      // Legacy Mythic title → Mystic
      return id === "mythic" ? "mystic" : id;
    }),
  );
}

/** Grant a loot unlock (idempotent). Returns true if newly inserted. */
export async function unlockLootRole(
  guildId: string,
  userId: string,
  lootId: string,
): Promise<boolean> {
  const normalized = lootId === "mythic" ? "mystic" : lootId;

  const existing = await supabase
    .from("UserLootUnlocks")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .or(`lootId.eq.${normalized},lootId.eq.mythic`)
    .limit(1)
    .maybeSingle();

  if (existing.error) {
    throw new Error(`[loot] unlock lookup failed: ${existing.error.message}`);
  }
  if (existing.data) return false;

  const res = await supabase.from("UserLootUnlocks").insert({
    id: newId(),
    guildId,
    userId,
    lootId: normalized,
    unlockedAt: new Date().toISOString(),
  });

  if (res.error) {
    // Unique race — treat as already unlocked.
    if (res.error.code === "23505") return false;
    throw new Error(`[loot] unlock insert failed: ${res.error.message}`);
  }
  return true;
}
