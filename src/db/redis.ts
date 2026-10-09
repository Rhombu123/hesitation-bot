import { Redis } from "ioredis";
import { config } from "../config.js";

/**
 * Shared Redis client (Railway Redis).
 * Used for cooldowns and cross-replica locks — the bot runs multiple replicas.
 */
export const redis = new Redis(config.redisUrl, {
  maxRetriesPerRequest: 2,
  enableReadyCheck: true,
  lazyConnect: true,
});

redis.on("error", (err: Error) => {
  console.error("[redis] connection error:", err.message);
});

export async function connectRedis(): Promise<void> {
  if (redis.status === "ready" || redis.status === "connecting") return;
  await redis.connect();
}

export async function pingRedis(): Promise<void> {
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error(`[redis] unexpected PING response: ${pong}`);
  }
}

export async function closeRedis(): Promise<void> {
  if (redis.status === "end") return;
  await redis.quit().catch(() => redis.disconnect());
}

/**
 * Atomic cooldown claim: SET key NX PX ms.
 * Returns null if claimed, or remaining TTL ms if already set.
 */
export async function claimCooldownMs(
  key: string,
  ttlMs: number,
): Promise<{ ok: true } | { ok: false; retryInMs: number }> {
  const result = await redis.set(key, "1", "PX", ttlMs, "NX");
  if (result === "OK") return { ok: true };
  const ttl = await redis.pttl(key);
  return { ok: false, retryInMs: ttl > 0 ? ttl : ttlMs };
}

/**
 * Cross-replica once-lock for a Discord event id (message / interaction).
 * Only the first replica to claim may handle that event.
 */
export async function claimEventOnce(
  kind: "msg" | "ix" | "react",
  eventId: string,
  ttlMs = 5 * 60_000,
): Promise<boolean> {
  const claim = await claimCooldownMs(`cd:once:${kind}:${eventId}`, ttlMs);
  return claim.ok;
}

const DISCORD_EPOCH_KEY = "bot:discord:epoch";

/**
 * Stamp this process as the sole Discord gateway owner.
 * Any older process sharing this Redis must stop handling Discord events.
 * Fixes double-replies when Fly + Railway (or overlapping deploys) both stay logged in.
 */
export async function claimDiscordGatewayEpoch(): Promise<string> {
  const epoch = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await redis.set(DISCORD_EPOCH_KEY, epoch);
  return epoch;
}

/** True while this process still owns the Discord gateway epoch. */
export async function isDiscordGatewayOwner(epoch: string): Promise<boolean> {
  const current = await redis.get(DISCORD_EPOCH_KEY);
  return current === epoch;
}

/** True if the key exists (still on cooldown). */
export async function isCooldownActive(key: string): Promise<boolean> {
  return (await redis.exists(key)) === 1;
}

/** Remaining cooldown ms (0 if expired / missing). */
export async function cooldownRemainingMs(key: string): Promise<number> {
  const ttl = await redis.pttl(key);
  return ttl > 0 ? ttl : 0;
}
