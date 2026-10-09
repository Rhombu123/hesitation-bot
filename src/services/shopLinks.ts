import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

export const SHOP_LINK_TTL_SEC = 15 * 60;
export const SHOP_OPEN_CUSTOM_ID = "shop:open";

export type ShopTier = "vip" | "elite" | "supreme" | "mythic";

export const SHOP_TIERS: readonly {
  id: ShopTier;
  label: string;
  blurb: string;
  priceLabel: string;
  priceUsd: string;
  /** Short Discord embed line — no boost counts. */
  embedLine: string;
  /** Full perk list for the web shop. */
  benefits: readonly string[];
}[] = [
  {
    id: "vip",
    label: "VIP",
    blurb: "Entry donor tier — blesses, quotes, and more.",
    priceLabel: "$5 / month",
    priceUsd: "$5",
    embedLine: "Entry donor perks",
    benefits: [
      "`!bless` — Small blessing (2× XP), 3 per day",
      "Higher daily +rep / −rep allowance",
      "Bonus reputation per give",
      "`!quote` access",
      "3 daily `!boost` charges for Supreme custom roles",
    ],
  },
  {
    id: "elite",
    label: "Elite",
    blurb: "Stronger blesses, ping reactions, and Elite actions.",
    priceLabel: "$7 / month",
    priceUsd: "$7",
    embedLine: "Elite actions & ping reactions",
    benefits: [
      "Everything in VIP",
      "`!bless` — Medium blessing (3× XP), 5 per day",
      "Elite GIF actions (`!kiss`, `!kill`, `!bully`, …)",
      "`.set` / `!set` — auto-react emojis when you’re pinged",
      "5 daily `!boost` charges",
    ],
  },
  {
    id: "supreme",
    label: "Supreme",
    blurb: "Custom role and full social command kit.",
    priceLabel: "$10 / month",
    priceUsd: "$10",
    embedLine: "Custom role + full action kit",
    benefits: [
      "Everything in Elite",
      "`!bless` — Large blessing (5× XP), 10 per day",
      "Create & share a custom role (`!role setup`, `!role give`)",
      "All GIF actions + freeform `!anything @user`",
      "10 daily `!boost` charges",
    ],
  },
  {
    id: "mythic",
    label: "Mythic",
    blurb: "Top-tier blessings and Mythic-only commands.",
    priceLabel: "$15 / month",
    priceUsd: "$15",
    embedLine: "Mythic-only commands",
    benefits: [
      "Everything in Supreme",
      "`!bless` — Huge blessing (10× XP), 15 per day",
      "`!uwuify`, `!invisible`, `!troll`",
      "26 daily `!boost` charges",
      "Highest donor standing in the server",
    ],
  },
] as const;

function shopSecret(): string {
  const secret = config.shopLinkSecret;
  if (!secret) {
    throw new Error("SHOP_LINK_SECRET is not configured.");
  }
  return secret;
}

function signPayload(uid: string, exp: number): string {
  return createHmac("sha256", shopSecret())
    .update(`${uid}.${exp}`)
    .digest("hex");
}

export function isShopTier(value: string): value is ShopTier {
  return (
    value === "vip" ||
    value === "elite" ||
    value === "supreme" ||
    value === "mythic"
  );
}

export type ShopLinkParams = {
  uid: string;
  exp: number;
  sig: string;
};

export function createShopLinkParams(userId: string): ShopLinkParams {
  const exp = Math.floor(Date.now() / 1000) + SHOP_LINK_TTL_SEC;
  const sig = signPayload(userId, exp);
  return { uid: userId, exp, sig };
}

export function buildShopUrl(userId: string): string {
  const base = config.shopPublicUrl.replace(/\/$/, "");
  const { uid, exp, sig } = createShopLinkParams(userId);
  const q = new URLSearchParams({
    uid,
    exp: String(exp),
    sig,
  });
  return `${base}/shop?${q.toString()}`;
}

export function buildShopBuyUrl(
  userId: string,
  tier: ShopTier,
  params?: ShopLinkParams,
): string {
  const base = config.shopPublicUrl.replace(/\/$/, "");
  const link = params ?? createShopLinkParams(userId);
  const q = new URLSearchParams({
    tier,
    uid: link.uid,
    exp: String(link.exp),
    sig: link.sig,
  });
  return `${base}/shop/buy?${q.toString()}`;
}

export type ShopLinkVerifyResult =
  | { ok: true; uid: string; exp: number; sig: string }
  | { ok: false; error: string };

export function verifyShopLink(opts: {
  uid: string | null;
  exp: string | null;
  sig: string | null;
}): ShopLinkVerifyResult {
  const uid = opts.uid?.trim() ?? "";
  const expRaw = opts.exp?.trim() ?? "";
  const sig = opts.sig?.trim() ?? "";

  if (!/^\d{15,21}$/.test(uid)) {
    return { ok: false, error: "Missing or invalid Discord user id." };
  }
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || exp <= 0) {
    return { ok: false, error: "Missing or invalid link expiry." };
  }
  if (!/^[a-f0-9]{64}$/i.test(sig)) {
    return { ok: false, error: "Missing or invalid link signature." };
  }

  if (exp < Math.floor(Date.now() / 1000)) {
    return {
      ok: false,
      error: "This shop link expired. Click Purchase Here in Discord again.",
    };
  }

  let expected: string;
  try {
    expected = signPayload(uid, exp);
  } catch {
    return { ok: false, error: "Shop signing is not configured on the server." };
  }

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(sig.toLowerCase(), "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "Invalid shop link signature." };
  }

  return { ok: true, uid, exp, sig: sig.toLowerCase() };
}

export function paymentLinkForTier(tier: ShopTier): string | undefined {
  switch (tier) {
    case "vip":
      return config.stripePaymentLinkVip;
    case "elite":
      return config.stripePaymentLinkElite;
    case "supreme":
      return config.stripePaymentLinkSupreme;
    case "mythic":
      return config.stripePaymentLinkMythic;
  }
}

/** Append client_reference_id so the webhook knows who paid. */
export function stripeCheckoutUrl(paymentLink: string, discordUserId: string): string {
  const url = new URL(paymentLink);
  url.searchParams.set("client_reference_id", discordUserId);
  return url.toString();
}

/** Match a Stripe Payment Link id (buy.stripe.com/…) to a shop tier. */
export function tierFromPaymentLinkUrl(paymentLinkUrl: string | null | undefined): ShopTier | null {
  if (!paymentLinkUrl) return null;
  let pathId = "";
  try {
    pathId = new URL(paymentLinkUrl).pathname.replace(/^\//, "");
  } catch {
    return null;
  }
  if (!pathId) return null;

  const pairs: [ShopTier, string | undefined][] = [
    ["vip", config.stripePaymentLinkVip],
    ["elite", config.stripePaymentLinkElite],
    ["supreme", config.stripePaymentLinkSupreme],
    ["mythic", config.stripePaymentLinkMythic],
  ];
  for (const [tier, link] of pairs) {
    if (!link) continue;
    try {
      const id = new URL(link).pathname.replace(/^\//, "");
      if (id && id === pathId) return tier;
    } catch {
      /* ignore bad env */
    }
  }
  return null;
}
