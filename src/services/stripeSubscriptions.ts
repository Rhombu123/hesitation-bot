/**
 * Redis index of active Stripe shop subscriptions keyed by Discord user.
 * Used so expiry tickers can skip revoke/delete while a recurring sub is live.
 */

import Stripe from "stripe";
import { config } from "../config.js";
import { redis } from "../db/redis.js";
import { isShopTier, type ShopTier } from "./shopLinks.js";

const SUB_TTL_SEC = 400 * 24 * 60 * 60; // ~13 months

export type StripeShopSub = {
  subscriptionId: string;
  discordUserId: string;
  tier: ShopTier;
};

function userKey(discordUserId: string): string {
  return `stripe:user:${discordUserId}`;
}

function subKey(subscriptionId: string): string {
  return `stripe:sub:${subscriptionId}`;
}

export async function rememberStripeShopSub(
  subscriptionId: string,
  discordUserId: string,
  tier: ShopTier,
): Promise<void> {
  const payload = JSON.stringify({
    subscriptionId,
    discordUserId,
    tier,
  } satisfies StripeShopSub);
  await redis.set(subKey(subscriptionId), payload, "EX", SUB_TTL_SEC);
  await redis.set(userKey(discordUserId), payload, "EX", SUB_TTL_SEC);
}

export async function forgetStripeShopSub(
  subscriptionId: string,
  discordUserId?: string,
): Promise<void> {
  const remembered = await loadStripeShopSubById(subscriptionId);
  await redis.del(subKey(subscriptionId));
  const uid = discordUserId ?? remembered?.discordUserId;
  if (!uid) return;
  const current = await loadStripeShopSubByUser(uid);
  if (!current || current.subscriptionId === subscriptionId) {
    await redis.del(userKey(uid));
  }
}

function parseSub(raw: string | null): StripeShopSub | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StripeShopSub>;
    if (
      parsed.subscriptionId &&
      parsed.discordUserId &&
      parsed.tier &&
      isShopTier(parsed.tier) &&
      /^\d{15,21}$/.test(parsed.discordUserId)
    ) {
      return {
        subscriptionId: parsed.subscriptionId,
        discordUserId: parsed.discordUserId,
        tier: parsed.tier,
      };
    }
    // Legacy shape: { discordUserId, tier } without subscriptionId on sub key.
    if (
      parsed.discordUserId &&
      parsed.tier &&
      isShopTier(parsed.tier) &&
      /^\d{15,21}$/.test(parsed.discordUserId)
    ) {
      return {
        subscriptionId: "",
        discordUserId: parsed.discordUserId,
        tier: parsed.tier,
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function loadStripeShopSubById(
  subscriptionId: string,
): Promise<StripeShopSub | null> {
  const parsed = parseSub(await redis.get(subKey(subscriptionId)));
  if (!parsed) return null;
  if (!parsed.subscriptionId) {
    return { ...parsed, subscriptionId };
  }
  return parsed;
}

export async function loadStripeShopSubByUser(
  discordUserId: string,
): Promise<StripeShopSub | null> {
  return parseSub(await redis.get(userKey(discordUserId)));
}

function stripeClient(): Stripe | null {
  if (!config.stripeSecretKey) return null;
  return new Stripe(config.stripeSecretKey);
}

const LIVE_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
  "unpaid",
]);

/**
 * True when this Discord user still has a live Stripe subscription for one of
 * the given shop tiers (recurring payment not canceled).
 */
export async function hasActiveStripeShopSub(
  discordUserId: string,
  tiers: readonly ShopTier[],
): Promise<boolean> {
  const remembered = await loadStripeShopSubByUser(discordUserId);
  if (!remembered || !tiers.includes(remembered.tier)) return false;

  const stripe = stripeClient();
  if (!stripe || !remembered.subscriptionId) {
    // Trust Redis index when we can't verify with Stripe.
    return true;
  }

  try {
    const sub = await stripe.subscriptions.retrieve(remembered.subscriptionId);
    if (LIVE_STATUSES.has(sub.status)) return true;
    // Ended / incomplete — drop the index so expiry can clean up.
    await forgetStripeShopSub(remembered.subscriptionId, discordUserId);
    return false;
  } catch (err) {
    console.warn(
      `[stripe] subscription lookup failed for ${remembered.subscriptionId}:`,
      err,
    );
    // Fail closed toward keeping access if Stripe is flaky mid-billing.
    return true;
  }
}
