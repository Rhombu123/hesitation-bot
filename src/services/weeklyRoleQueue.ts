import type { Client } from "discord.js";

/** Set on bot ready so currency/rep awards can refresh weekly boards. */
let clientRef: Client | null = null;
let syncFn:
  | ((client: Client, guildId: string) => Promise<void>)
  | null = null;
export type WeeklyBoardKind = "genius" | "popular" | "both";

let refreshBoardsFn:
  | ((client: Client, kind?: WeeklyBoardKind) => Promise<void>)
  | null = null;

const DEBOUNCE_MS = 1_500;
const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function bindWeeklyLeaderClient(client: Client): void {
  clientRef = client;
}

export function registerWeeklyLeaderSync(
  fn: (client: Client, guildId: string) => Promise<void>,
): void {
  syncFn = fn;
}

export function registerWeeklyBoardRefresh(
  fn: (client: Client, kind?: WeeklyBoardKind) => Promise<void>,
): void {
  refreshBoardsFn = fn;
}

/** Fire-and-forget role sync when client is bound. */
export function queueWeeklyLeaderRoleSync(guildId: string): void {
  if (!clientRef || !syncFn) return;
  void syncFn(clientRef, guildId).catch((err) =>
    console.warn("[weeklyRoles] queued sync failed:", err),
  );
}

/**
 * Debounced channel-board refresh after points / +rep.
 * Collapses rapid awards into one Discord edit.
 */
export function queueWeeklyBoardRefresh(
  kind: WeeklyBoardKind = "both",
): void {
  if (!clientRef || !refreshBoardsFn) return;
  const key = kind;
  const existing = pendingTimers.get(key);
  if (existing) clearTimeout(existing);

  const client = clientRef;
  const fn = refreshBoardsFn;
  pendingTimers.set(
    key,
    setTimeout(() => {
      pendingTimers.delete(key);
      void fn(client, kind).catch((err) =>
        console.warn(`[weeklyLb] queued ${kind} refresh failed:`, err),
      );
    }, DEBOUNCE_MS),
  );
}
