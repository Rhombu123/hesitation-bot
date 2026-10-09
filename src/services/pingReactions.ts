import { newId, supabase } from "../db/supabase.js";

export type PingReactionEmoji = {
  /** Discord react identifier: unicode char(s) or `name:id` for custom. */
  react: string;
  /** Display form for embeds (unicode or `<:name:id>` / `<a:name:id>`). */
  display: string;
};

export async function getPingReactionSet(
  guildId: string,
  userId: string,
): Promise<PingReactionEmoji[]> {
  const { data, error } = await supabase
    .from("PingReactionSet")
    .select("emojis")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`[supabase:getPingReactionSet] ${error.message}`);
  }
  if (!data?.emojis || !Array.isArray(data.emojis)) return [];
  return data.emojis as PingReactionEmoji[];
}

export async function setPingReactionSet(
  guildId: string,
  userId: string,
  emojis: PingReactionEmoji[],
): Promise<void> {
  const { data: existing } = await supabase
    .from("PingReactionSet")
    .select("id")
    .eq("guildId", guildId)
    .eq("userId", userId)
    .maybeSingle();

  const row = {
    emojis,
    updatedAt: new Date().toISOString(),
  };

  if (existing?.id) {
    const { error } = await supabase
      .from("PingReactionSet")
      .update(row)
      .eq("id", existing.id as string);
    if (error) {
      throw new Error(`[supabase:setPingReactionSet.update] ${error.message}`);
    }
    return;
  }

  const { error } = await supabase.from("PingReactionSet").insert({
    id: newId(),
    guildId,
    userId,
    ...row,
  });
  if (error) {
    throw new Error(`[supabase:setPingReactionSet.insert] ${error.message}`);
  }
}

export async function clearPingReactionSet(
  guildId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("PingReactionSet")
    .delete()
    .eq("guildId", guildId)
    .eq("userId", userId)
    .select("id");

  if (error) {
    throw new Error(`[supabase:clearPingReactionSet] ${error.message}`);
  }
  return (data?.length ?? 0) > 0;
}

/** Load all presets for users mentioned in a message (batched). */
export async function getPingReactionSetsForUsers(
  guildId: string,
  userIds: string[],
): Promise<Map<string, PingReactionEmoji[]>> {
  const out = new Map<string, PingReactionEmoji[]>();
  if (userIds.length === 0) return out;

  const { data, error } = await supabase
    .from("PingReactionSet")
    .select("userId, emojis")
    .eq("guildId", guildId)
    .in("userId", userIds);

  if (error) {
    throw new Error(`[supabase:getPingReactionSetsForUsers] ${error.message}`);
  }

  for (const row of data ?? []) {
    const emojis = row.emojis;
    if (Array.isArray(emojis) && emojis.length > 0) {
      out.set(row.userId as string, emojis as PingReactionEmoji[]);
    }
  }
  return out;
}
