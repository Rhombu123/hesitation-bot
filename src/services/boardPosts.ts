import { supabase } from "../db/supabase.js";

export type BoardPostKind =
  | "genius"
  | "genius-alltime"
  | "popular"
  | "popular-alltime"
  | "hated-alltime";

export async function getBoardPostMessageId(
  guildId: string,
  kind: BoardPostKind,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("LeaderboardBoardPosts")
    .select("messageId")
    .eq("guildId", guildId)
    .eq("kind", kind)
    .maybeSingle();

  if (error) {
    console.warn(`[weeklyLb] getBoardPost failed (${error.message})`);
    return null;
  }
  return (data?.messageId as string | undefined) ?? null;
}

export async function saveBoardPostMessageId(
  guildId: string,
  kind: BoardPostKind,
  channelId: string,
  messageId: string,
): Promise<void> {
  const { error } = await supabase.from("LeaderboardBoardPosts").upsert(
    {
      guildId,
      kind,
      channelId,
      messageId,
      updatedAt: new Date().toISOString(),
    },
    { onConflict: "guildId,kind" },
  );

  if (error) {
    console.warn(`[weeklyLb] saveBoardPost failed (${error.message})`);
  }
}
