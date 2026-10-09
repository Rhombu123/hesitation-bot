import type { Client } from "discord.js";
import Stripe from "stripe";
import { config } from "../config.js";
import { ROLE_IDS } from "../config/rolePrivileges.js";
import { claimCooldownMs } from "../db/redis.js";
import {
  announceDonation,
  type DonationTier,
} from "../services/donationAnnounce.js";
import {
  isShopTier,
  type ShopTier,
} from "../services/shopLinks.js";
import {
  forgetStripeShopSub,
  loadStripeShopSubById,
  rememberStripeShopSub,
} from "../services/stripeSubscriptions.js";
import { grantBotSupreme, revokeBotSupreme } from "../services/supremeGrants.js";
import {
  grantTimedPaidRole,
  revokeTimedPaidRole,
  type PaidRoleKind,
} from "../services/timedRoleGrants.js";

function stripeClient(): Stripe {
  // Webhook signature verify does not need a live secret key; retrieve/update does.
  return new Stripe(config.stripeSecretKey || "sk_webhook_verify_only");
}

function hasStripeApiKey(): boolean {
  return Boolean(config.stripeSecretKey);
}

function tierFromEnvPaymentLinkId(paymentLinkId: string): ShopTier | null {
  const pairs: [ShopTier, string | undefined, string | undefined][] = [
    ["vip", config.stripePaymentLinkVip, config.stripePlinkVip],
    ["elite", config.stripePaymentLinkElite, config.stripePlinkElite],
    ["supreme", config.stripePaymentLinkSupreme, config.stripePlinkSupreme],
    ["mythic", config.stripePaymentLinkMythic, config.stripePlinkMythic],
  ];
  for (const [tier, link, plinkId] of pairs) {
    if (plinkId && plinkId === paymentLinkId) return tier;
    if (!link) continue;
    if (link === paymentLinkId || link.includes(paymentLinkId)) return tier;
    try {
      const pathId = new URL(link).pathname.replace(/^\//, "");
      if (pathId && (pathId === paymentLinkId || link.endsWith(paymentLinkId))) {
        return tier;
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function resolveTier(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<ShopTier | null> {
  const meta = session.metadata?.tier?.toLowerCase();
  if (meta && isShopTier(meta)) return meta;

  const plRef = session.payment_link;
  if (!plRef) return null;

  const plId = typeof plRef === "string" ? plRef : plRef.id;
  const fromEnv = tierFromEnvPaymentLinkId(plId);
  if (fromEnv) return fromEnv;

  if (!hasStripeApiKey()) return null;

  try {
    const pl =
      typeof plRef === "string"
        ? await stripe.paymentLinks.retrieve(plRef)
        : plRef;
    const plMeta = pl.metadata?.tier?.toLowerCase();
    if (plMeta && isShopTier(plMeta)) return plMeta;
    if (pl.url) {
      const byUrl = tierFromEnvPaymentLinkId(pl.url);
      if (byUrl) return byUrl;
    }
  } catch (err) {
    console.warn("[stripe] paymentLinks.retrieve failed:", err);
  }

  return null;
}

async function resolveShopGuild(client: Client) {
  const guildId = config.shopGuildId ?? config.mainGuildId;
  if (guildId) return client.guilds.fetch(guildId);

  // Prefer the guild that already has the VIP donor role.
  await client.guilds.fetch();
  for (const guild of client.guilds.cache.values()) {
    if (ROLE_IDS.vip && guild.roles.cache.has(ROLE_IDS.vip)) return guild;
  }
  const first = client.guilds.cache.first();
  if (!first) throw new Error("Bot is in no guilds — cannot grant shop roles.");
  return first;
}

async function grantShopTier(
  client: Client,
  discordUserId: string,
  tier: ShopTier,
  opts: { announce: boolean },
): Promise<void> {
  const guild = await resolveShopGuild(client);
  const member = await guild.members.fetch(discordUserId);

  if (tier === "supreme") {
    await grantBotSupreme(member, { grantedBy: "stripe" });
  } else {
    await grantTimedPaidRole(member, tier, {
      reason: `Stripe purchase: ${tier}`,
    });
  }

  if (opts.announce) {
    await announceDonation(member, tier as DonationTier).catch((err) =>
      console.error("[stripe] announce failed:", err),
    );
  }

  console.log(
    `[stripe] Granted ${tier} to ${member.user.tag} (${discordUserId}) in ${guild.id}`,
  );
}

async function revokeShopTier(
  client: Client,
  discordUserId: string,
  tier: ShopTier,
): Promise<void> {
  const guild = await resolveShopGuild(client).catch(() => null);
  if (!guild) return;

  if (tier === "supreme") {
    await revokeBotSupreme(guild, discordUserId, "Stripe subscription ended");
  } else {
    await revokeTimedPaidRole(
      guild,
      discordUserId,
      tier as PaidRoleKind,
      "Stripe subscription ended",
    );
  }
}

/**
 * Handle a verified Stripe webhook body (raw bytes).
 */
export async function handleStripeWebhookEvent(
  client: Client,
  rawBody: Buffer,
  signature: string | string[] | undefined,
): Promise<{ status: number; body: string }> {
  const whSecret = config.stripeWebhookSecret;
  if (!whSecret) {
    return { status: 503, body: "Stripe webhook not configured" };
  }

  const stripe = stripeClient();
  const sig = Array.isArray(signature) ? signature[0] : signature;
  if (!sig) {
    return { status: 400, body: "Missing stripe-signature" };
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, whSecret);
  } catch (err) {
    console.warn(
      "[stripe] Signature verify failed:",
      err instanceof Error ? err.message : err,
    );
    return { status: 400, body: "Invalid signature" };
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;

    const claim = await claimCooldownMs(
      `stripe:session:${session.id}`,
      30 * 24 * 60 * 60_000,
    );
    if (!claim.ok) {
      console.log(`[stripe] Duplicate session ${session.id} — skipping`);
      return { status: 200, body: "duplicate" };
    }

    const discordUserId = session.client_reference_id?.trim() ?? "";
    if (!/^\d{15,21}$/.test(discordUserId)) {
      console.warn(
        `[stripe] Session ${session.id} missing client_reference_id (Discord user id)`,
      );
      return { status: 200, body: "missing discord id" };
    }

    const tier = await resolveTier(stripe, session);
    if (!tier) {
      console.warn(
        `[stripe] Session ${session.id} could not map to a shop tier`,
        session.payment_link,
      );
      return { status: 200, body: "unknown tier" };
    }

    const subId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
    if (subId) {
      await rememberStripeShopSub(subId, discordUserId, tier);
      if (hasStripeApiKey()) {
        await stripe.subscriptions
          .update(subId, {
            metadata: { discord_user_id: discordUserId, tier },
          })
          .catch((err) =>
            console.warn("[stripe] subscription metadata update failed:", err),
          );
      }
    }

    try {
      await grantShopTier(client, discordUserId, tier, { announce: true });
    } catch (err) {
      console.error("[stripe] Grant failed:", err);
      return { status: 500, body: "grant failed" };
    }

    return { status: 200, body: "ok" };
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object as Stripe.Invoice & {
      subscription?: string | { id: string } | null;
    };
    const subId =
      typeof invoice.subscription === "string"
        ? invoice.subscription
        : invoice.subscription && typeof invoice.subscription === "object"
          ? invoice.subscription.id
          : null;
    if (!subId) return { status: 200, body: "no subscription" };

    // Skip the first invoice — checkout.session.completed already granted + announced.
    if (invoice.billing_reason === "subscription_create") {
      return { status: 200, body: "initial invoice" };
    }

    const remembered = await loadStripeShopSubById(subId);
    if (!remembered) {
      console.warn(`[stripe] invoice.paid unknown subscription ${subId}`);
      return { status: 200, body: "unknown subscription" };
    }

    const claim = await claimCooldownMs(
      `stripe:invoice:${invoice.id}`,
      30 * 24 * 60 * 60_000,
    );
    if (!claim.ok) return { status: 200, body: "duplicate" };

    // Refresh the user↔sub index (covers legacy Redis entries).
    await rememberStripeShopSub(subId, remembered.discordUserId, remembered.tier);

    try {
      await grantShopTier(client, remembered.discordUserId, remembered.tier, {
        announce: false,
      });
    } catch (err) {
      console.error("[stripe] Renewal grant failed:", err);
      return { status: 500, body: "grant failed" };
    }
    return { status: 200, body: "renewed" };
  }

  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    const remembered = await loadStripeShopSubById(sub.id);
    const discordUserId =
      remembered?.discordUserId ?? sub.metadata?.discord_user_id?.trim();
    const tierRaw = remembered?.tier ?? sub.metadata?.tier?.toLowerCase();
    if (!discordUserId || !tierRaw || !isShopTier(tierRaw)) {
      return { status: 200, body: "unknown subscription" };
    }
    try {
      await revokeShopTier(client, discordUserId, tierRaw);
    } catch (err) {
      console.error("[stripe] Revoke failed:", err);
      return { status: 500, body: "revoke failed" };
    }
    await forgetStripeShopSub(sub.id, discordUserId);
    return { status: 200, body: "revoked" };
  }

  return { status: 200, body: "ignored" };
}
