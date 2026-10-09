/**
 * Auto-post the role shop embed every 2 hours (donation / shop promo channel).
 * Redis slot lock so overlapping replicas never double-post.
 */

import type { Client, TextChannel } from "discord.js";
import { config } from "../config.js";
import { claimCooldownMs } from "../db/redis.js";
import { buildShopPromoMessage } from "../commands/shop.js";

const INTERVAL_MS = 2 * 60 * 60_000;
/** Check often enough to catch the next 2h slot after restarts. */
const TICK_MS = 5 * 60_000;

let tickInterval: ReturnType<typeof setInterval> | null = null;
let clientRef: Client | null = null;

function shopPromoChannelId(): string {
  return config.shopPromoChannelId || config.donationChannelId;
}

function currentSlot(): number {
  return Math.floor(Date.now() / INTERVAL_MS);
}

async function postShopPromo(client: Client): Promise<void> {
  if (!config.shopLinkSecret || !config.shopPublicUrl) {
    console.warn(
      "[shopPromo] Skipping — SHOP_LINK_SECRET / SHOP_PUBLIC_URL not configured.",
    );
    return;
  }

  const channelId = shopPromoChannelId();
  if (!channelId) {
    console.warn("[shopPromo] No shop promo / donation channel configured.");
    return;
  }

  const slot = currentSlot();
  const claim = await claimCooldownMs(
    `shop:promo:slot:${channelId}:${slot}`,
    INTERVAL_MS + 60_000,
  );
  if (!claim.ok) return;

  const channel = await client.channels.fetch(channelId).catch((err) => {
    console.warn(`[shopPromo] Failed to fetch channel ${channelId}:`, err);
    return null;
  });
  if (!channel?.isTextBased() || channel.isDMBased() || !("send" in channel)) {
    console.warn(`[shopPromo] Channel ${channelId} missing or not sendable.`);
    return;
  }

  const botUser = client.user;
  if (!botUser) return;

  const payload = buildShopPromoMessage(botUser);
  await (channel as TextChannel).send({
    ...payload,
    allowedMentions: { parse: [] },
  });
  console.log(`[shopPromo] Posted shop embed in ${channelId} (slot ${slot}).`);
}

async function tick(): Promise<void> {
  const client = clientRef;
  if (!client?.isReady()) return;
  try {
    await postShopPromo(client);
  } catch (err) {
    console.error("[shopPromo] tick failed:", err);
  }
}

export function startShopPromoTicker(client: Client): void {
  stopShopPromoTicker();
  clientRef = client;
  // First attempt shortly after ready, then every 5 minutes (Redis gates to 1 post / 2h).
  void tick();
  tickInterval = setInterval(() => void tick(), TICK_MS);
  console.log(
    `[shopPromo] Ticker started — posts to ${shopPromoChannelId()} every 2 hours.`,
  );
}

export function stopShopPromoTicker(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
  }
  clientRef = null;
}
