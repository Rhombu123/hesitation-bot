/**
 * Role shop HTML + Stripe checkout redirects (bot-signed Discord links).
 *
 * Visual direction: Hesitation night sky — royal blue from the moon logo,
 * soft cloud whites, star glow. Logo sits top-right as the page signature.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  SHOP_TIERS,
  buildShopBuyUrl,
  isShopTier,
  paymentLinkForTier,
  stripeCheckoutUrl,
  verifyShopLink,
  type ShopTier,
} from "../services/shopLinks.js";

const LOGO_PATH = "/assets/shop-moon-logo.jpg";

/** Four-point star, matches the sparkles in the moon logo. */
const SPARKLE_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0c.6 7 5 11.4 12 12-7 .6-11.4 5-12 12-.6-7-5-11.4-12-12 7-.6 11.4-5 12-12z"/></svg>';

function send(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = "text/html; charset=utf-8",
): void {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Render light Discord-ish `code` markers inside perk strings. */
function formatPerk(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
}

const TIER_ACCENT: Record<ShopTier, string> = {
  vip: "#f3c969",
  elite: "#a7bfff",
  supreme: "#ff8fa3",
  mythic: "#ffb45c",
};

const TIER_BADGE: Partial<Record<ShopTier, string>> = {
  supreme: "Most popular",
  mythic: "Everything",
};

const TIER_TAGLINE: Record<ShopTier, string> = {
  vip: "A first step in — blesses, quotes, more rep.",
  elite: "More daily blessing power and Elite GIF actions.",
  supreme: "Your own custom role, every action unlocked.",
  mythic: "All of Supreme plus Mythic-only commands.",
};

function layout(opts: { title: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0b1b55" />
  <title>${escapeHtml(opts.title)}</title>
  <link rel="icon" type="image/jpeg" href="${LOGO_PATH}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
  <style>
    :root {
      --midnight: #071238;
      --royal: #1b3a9c;
      --sky: #2a55c9;
      --cloud: #f4f7ff;
      --mist: #a9b9e3;
      --line: rgba(244,247,255,0.14);
      --card: rgba(11,27,85,0.62);
      --glow: rgba(244,247,255,0.5);
      --focus: #ffd86b;
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: "Plus Jakarta Sans", system-ui, sans-serif;
      color: var(--cloud);
      background: var(--midnight);
      -webkit-font-smoothing: antialiased;
      line-height: 1.5;
    }
    a { color: inherit; }
    :focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 3px;
      border-radius: 6px;
    }

    /* ---------- sky ---------- */
    .sky {
      position: relative;
      isolation: isolate;
      min-height: 100vh;
      overflow: clip;
      background:
        radial-gradient(ellipse 80% 45% at 50% -8%, #2f5bd6 0%, transparent 60%),
        linear-gradient(180deg, #12297a 0%, #0b1b55 40%, var(--midnight) 100%);
    }
    /* Three tiled star fields, fixed to the viewport, twinkling out of phase. */
    .stars {
      position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background-repeat: repeat;
    }
    .stars.a {
      background-size: 420px 420px;
      background-image:
        radial-gradient(1.4px 1.4px at 8% 14%, rgba(255,255,255,.9), transparent),
        radial-gradient(1px 1px at 22% 62%, rgba(255,255,255,.6), transparent),
        radial-gradient(1.8px 1.8px at 46% 9%, rgba(255,255,255,.85), transparent),
        radial-gradient(1px 1px at 68% 36%, rgba(255,255,255,.55), transparent),
        radial-gradient(1.4px 1.4px at 90% 74%, rgba(255,255,255,.75), transparent);
      animation: twinkle 4.5s ease-in-out infinite alternate;
    }
    .stars.b {
      background-size: 560px 560px;
      background-image:
        radial-gradient(1px 1px at 15% 88%, rgba(255,255,255,.7), transparent),
        radial-gradient(1.6px 1.6px at 33% 28%, rgba(220,232,255,.8), transparent),
        radial-gradient(1px 1px at 58% 70%, rgba(255,255,255,.5), transparent),
        radial-gradient(1.3px 1.3px at 79% 12%, rgba(255,255,255,.75), transparent),
        radial-gradient(1px 1px at 94% 48%, rgba(255,255,255,.45), transparent);
      animation: twinkle 6.5s ease-in-out infinite alternate-reverse;
    }
    .stars.c {
      background-size: 760px 760px;
      background-image:
        radial-gradient(2px 2px at 12% 40%, rgba(255,255,255,.55), transparent),
        radial-gradient(1px 1px at 40% 84%, rgba(255,255,255,.5), transparent),
        radial-gradient(1.5px 1.5px at 64% 22%, rgba(200,218,255,.6), transparent),
        radial-gradient(1px 1px at 86% 90%, rgba(255,255,255,.45), transparent);
      animation: twinkle 8s ease-in-out infinite alternate 1.2s;
    }
    /* A few four-point sparkles that glint in and out. */
    .sparkle {
      position: fixed; z-index: -1; pointer-events: none;
      width: 14px; height: 14px; color: #fff;
      filter: drop-shadow(0 0 6px rgba(255,255,255,.75));
      animation: glint 5.2s ease-in-out infinite;
      opacity: 0;
    }
    .sparkle svg { width: 100%; height: 100%; display: block; }
    .sparkle.s1 { top: 14%; left: 9%;  animation-delay: 0s;   transform: scale(.8); }
    .sparkle.s2 { top: 26%; left: 71%; animation-delay: 1.3s; transform: scale(1.05); }
    .sparkle.s3 { top: 58%; left: 22%; animation-delay: 2.4s; transform: scale(.65); }
    .sparkle.s4 { top: 72%; left: 84%; animation-delay: 3.1s; transform: scale(.9); }
    .sparkle.s5 { top: 42%; left: 50%; animation-delay: 4.2s; transform: scale(.6); }
    .clouds {
      position: absolute; left: -5%; right: -5%; bottom: -3rem;
      height: min(26vh, 240px); z-index: -1; pointer-events: none;
      background:
        radial-gradient(ellipse 34% 60% at 8% 85%, rgba(244,247,255,.92), transparent 70%),
        radial-gradient(ellipse 30% 55% at 26% 95%, rgba(222,232,255,.9), transparent 70%),
        radial-gradient(ellipse 40% 62% at 52% 100%, rgba(244,247,255,.9), transparent 72%),
        radial-gradient(ellipse 34% 58% at 78% 92%, rgba(214,228,255,.88), transparent 70%),
        radial-gradient(ellipse 28% 50% at 96% 98%, rgba(244,247,255,.85), transparent 70%);
      filter: blur(1.5px);
    }

    /* ---------- header ---------- */
    .top {
      position: sticky; top: 0; z-index: 10;
      backdrop-filter: blur(14px);
      background: linear-gradient(180deg, rgba(7,18,56,.85), rgba(7,18,56,.55));
      border-bottom: 1px solid var(--line);
    }
    .top-inner {
      width: min(1080px, calc(100% - 2rem));
      margin: 0 auto;
      display: flex; align-items: center; justify-content: space-between;
      gap: 1rem; padding: .7rem 0;
    }
    .wordmark {
      display: flex; flex-direction: column; line-height: 1.05;
      text-decoration: none;
    }
    .wordmark b {
      font-family: Fraunces, Georgia, serif;
      font-weight: 600; font-size: 1.35rem; letter-spacing: -.01em;
    }
    .wordmark span {
      font-size: .72rem; font-weight: 600; letter-spacing: .16em;
      text-transform: uppercase; color: var(--mist);
    }
    .logo {
      width: 52px; height: 52px; border-radius: 50%;
      object-fit: cover; display: block;
      box-shadow: 0 0 0 2px rgba(244,247,255,.25), 0 0 28px rgba(120,160,255,.45);
    }
    .who {
      display: inline-flex; align-items: center; gap: .5rem;
      padding: .4rem .7rem; border-radius: 999px;
      border: 1px solid var(--line); background: rgba(244,247,255,.06);
      font-size: .78rem; color: var(--mist); white-space: nowrap;
    }
    .who i {
      width: .5rem; height: .5rem; border-radius: 50%;
      background: #7df0b0; box-shadow: 0 0 10px #7df0b0;
    }
    .who code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      color: var(--cloud); font-size: .76rem;
    }
    @media (max-width: 640px) {
      .who code { display: none; }
      .logo { width: 44px; height: 44px; }
    }

    /* ---------- content ---------- */
    main {
      width: min(1080px, calc(100% - 2rem));
      margin: 0 auto;
      padding: clamp(2.25rem, 7vh, 4.5rem) 0 7rem;
    }
    .hero { max-width: 40rem; animation: rise .6s ease both; }
    .hero h1 {
      font-family: Fraunces, Georgia, serif;
      font-variation-settings: "opsz" 144;
      font-weight: 600;
      font-size: clamp(2.4rem, 6.4vw, 4.1rem);
      line-height: 1.02; letter-spacing: -.02em;
      margin: 0 0 1rem;
      text-shadow: 0 0 30px rgba(244,247,255,.18);
    }
    .hero h1 em { font-style: italic; font-weight: 500; color: #dbe6ff; }
    .hero p { margin: 0; color: var(--mist); font-size: 1.06rem; max-width: 34rem; }

    .notice {
      margin-top: 1.25rem; padding: .9rem 1.1rem; border-radius: 14px;
      border: 1px solid rgba(255,216,107,.4); background: rgba(255,216,107,.1);
      color: #ffe9a8; font-size: .92rem;
      animation: rise .6s ease .12s both;
    }
    .notice b { color: #fff3c4; }
    .notice code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: rgba(255,255,255,.1); padding: .05rem .35rem; border-radius: 4px;
    }

    /* ---------- tiers ---------- */
    .section-label {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 1rem; margin: 2.25rem 0 1rem;
    }
    .section-label h2 {
      font-family: Fraunces, Georgia, serif; font-weight: 600;
      font-size: 1.5rem; margin: 0; letter-spacing: -.01em;
    }
    .section-label span { color: var(--mist); font-size: .9rem; }
    @media (max-width: 600px) {
      .section-label { flex-direction: column; align-items: flex-start; gap: .3rem; margin-top: 2.25rem; }
      .section-label h2 { white-space: nowrap; }
    }

    .tiers {
      display: grid; gap: 1rem;
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    @media (max-width: 1000px) { .tiers { grid-template-columns: repeat(2, minmax(0,1fr)); } }
    @media (max-width: 600px)  { .tiers { grid-template-columns: 1fr; } }

    .tier {
      --accent: #f3c969;
      position: relative; display: flex; flex-direction: column;
      padding: 1.35rem 1.25rem 1.25rem; border-radius: 20px;
      border: 1px solid var(--line);
      background:
        radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%),
        var(--card);
      backdrop-filter: blur(10px);
      box-shadow: 0 14px 40px rgba(0,0,0,.25);
      transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease;
      animation: rise .6s ease both;
    }
    .tier:nth-child(1){animation-delay:.14s}.tier:nth-child(2){animation-delay:.2s}
    .tier:nth-child(3){animation-delay:.26s}.tier:nth-child(4){animation-delay:.32s}
    .tier:hover {
      transform: translateY(-3px);
      border-color: color-mix(in srgb, var(--accent) 55%, var(--line));
      box-shadow: 0 18px 50px rgba(0,0,0,.32), 0 0 30px color-mix(in srgb, var(--accent) 18%, transparent);
    }
    .tier.featured { border-color: color-mix(in srgb, var(--accent) 60%, var(--line)); }
    .badge {
      position: absolute; top: -.7rem; left: 1.1rem;
      padding: .25rem .65rem; border-radius: 999px;
      font-size: .7rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase;
      color: var(--midnight); background: var(--accent);
      box-shadow: 0 4px 14px color-mix(in srgb, var(--accent) 45%, transparent);
    }
    .tier h3 {
      font-family: Fraunces, Georgia, serif; font-weight: 600;
      font-size: 1.6rem; letter-spacing: -.01em; margin: .2rem 0 .15rem;
    }
    .price {
      display: flex; align-items: baseline; gap: .3rem; margin-bottom: .55rem;
    }
    .price b {
      font-family: Fraunces, serif; font-weight: 700;
      font-size: 2.1rem; letter-spacing: -.02em; color: var(--accent);
      line-height: 1;
    }
    .price span { color: var(--mist); font-size: .9rem; }
    .tagline { margin: 0 0 1rem; color: #dbe6ff; font-size: .92rem; min-height: 2.8em; }

    .perks { margin: 0 0 1.25rem; padding: 0; list-style: none; display: grid; gap: .5rem; flex: 1; }
    .perks li {
      display: flex; gap: .55rem; align-items: flex-start;
      font-size: .9rem; color: #e3ebff; line-height: 1.4;
    }
    .perks svg { flex: none; width: 1.05rem; height: 1.05rem; margin-top: .15rem; color: var(--accent); }
    .perks code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82em;
      background: rgba(244,247,255,.1); padding: .05rem .35rem; border-radius: 4px;
    }

    .cta {
      display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
      width: 100%; padding: .9rem 1rem; border-radius: 999px;
      font-weight: 700; font-size: .95rem; text-decoration: none;
      color: var(--midnight); background: var(--cloud);
      border: 1px solid transparent;
      box-shadow: 0 8px 22px rgba(0,0,0,.25);
      transition: transform .15s ease, box-shadow .15s ease, background .15s ease;
    }
    .cta:hover { transform: translateY(-1px); background: #fff; box-shadow: 0 10px 28px rgba(0,0,0,.3), 0 0 24px var(--glow); }
    .cta.ghost {
      color: var(--mist); background: rgba(244,247,255,.06);
      border-color: var(--line); box-shadow: none; cursor: default;
    }
    .cta.ghost:hover { transform: none; background: rgba(244,247,255,.08); }
    .cta small { font-weight: 500; opacity: .75; }

    footer {
      margin-top: 3.5rem; display: flex; flex-wrap: wrap; gap: .75rem 1.5rem;
      align-items: center; color: var(--mist); font-size: .82rem;
    }

    .error {
      border: 1px solid rgba(255,143,163,.45); background: rgba(255,143,163,.12);
      padding: 1.1rem 1.25rem; border-radius: 16px; color: #ffd6dd; max-width: 40rem;
    }
    .error b { display: block; margin-bottom: .3rem; color: #fff; }

    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @keyframes twinkle { from { opacity: .35; } to { opacity: 1; } }
    @keyframes glint {
      0%, 100% { opacity: 0; }
      45%, 55% { opacity: .95; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="sky">
    <div class="stars a" aria-hidden="true"></div>
    <div class="stars b" aria-hidden="true"></div>
    <div class="stars c" aria-hidden="true"></div>
    ${["s1", "s2", "s3", "s4", "s5"]
      .map(
        (s) =>
          `<span class="sparkle ${s}" aria-hidden="true">${SPARKLE_SVG}</span>`,
      )
      .join("")}
    <div class="clouds" aria-hidden="true"></div>
    ${opts.body}
  </div>
</body>
</html>`;
}

const CHECK_SVG =
  '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function header(uid: string | null): string {
  const who = uid
    ? `<span class="who"><i aria-hidden="true"></i> Linked to Discord <code>${escapeHtml(uid)}</code></span>`
    : "";
  return `
    <header class="top">
      <div class="top-inner">
        <a class="wordmark" href="/shop" aria-label="Hesitation role shop">
          <b>Hesitation</b>
          <span>Role shop</span>
        </a>
        <div style="display:flex;align-items:center;gap:.9rem">
          ${who}
          <img class="logo" src="${LOGO_PATH}" width="52" height="52" alt="Hesitation moon logo" />
        </div>
      </div>
    </header>`;
}

function shopPage(opts: {
  uid: string | null;
  exp: number | null;
  sig: string | null;
  checkoutReady: boolean;
}): string {
  const params =
    opts.checkoutReady && opts.uid && opts.exp != null && opts.sig
      ? { uid: opts.uid, exp: opts.exp, sig: opts.sig }
      : null;

  const cards = SHOP_TIERS.map((tier) => {
    const accent = TIER_ACCENT[tier.id];
    const badge = TIER_BADGE[tier.id];
    const configured = Boolean(paymentLinkForTier(tier.id));
    const perks = tier.benefits
      .map((b) => `<li>${CHECK_SVG}<span>${formatPerk(b)}</span></li>`)
      .join("");

    let cta: string;
    if (params && configured) {
      const href = buildShopBuyUrl(params.uid, tier.id, params);
      cta = `<a class="cta" href="${escapeHtml(href)}">Get ${escapeHtml(tier.label)} <small>· ${escapeHtml(tier.priceUsd)}/mo</small></a>`;
    } else if (!configured) {
      cta = `<span class="cta ghost" aria-disabled="true">Coming soon</span>`;
    } else {
      cta = `<span class="cta ghost" aria-disabled="true">Open <code style="font-family:inherit">!shop</code> in Discord to buy</span>`;
    }

    return `
      <article class="tier${badge ? " featured" : ""}" style="--accent:${accent}">
        ${badge ? `<span class="badge">${escapeHtml(badge)}</span>` : ""}
        <h3>${escapeHtml(tier.label)}</h3>
        <div class="price"><b>${escapeHtml(tier.priceUsd)}</b><span>/ month</span></div>
        <p class="tagline">${escapeHtml(TIER_TAGLINE[tier.id])}</p>
        <ul class="perks">${perks}</ul>
        ${cta}
      </article>`;
  }).join("\n");

  const notice = params
    ? ""
    : `<div class="notice"><b>Want to buy?</b> Run <code>!shop</code> in the Hesitation server. The bot sends you a personal link so the role lands on your account — links last 15 minutes.</div>`;

  return layout({
    title: "Hesitation — Role Shop",
    body: `
      ${header(params?.uid ?? null)}
      <main>
        <section class="hero">
          <h1>Pick a role.<br/><em>Perks land the moment you pay.</em></h1>
          <p>Support Hesitation with a monthly donor role. Everything each tier unlocks is listed below — no surprises.</p>
          ${notice}
        </section>

        <div class="section-label">
          <h2>Donor roles</h2>
          <span>Billed monthly · cancel anytime from your Stripe receipt</span>
        </div>
        <section class="tiers" aria-label="Donor roles">${cards}</section>

        <footer>
          <span>Payments handled by Stripe.</span>
          <span>Roles are tied to the Discord account that opened the link.</span>
        </footer>
      </main>
    `,
  });
}

function errorPage(message: string): string {
  return layout({
    title: "Hesitation — Shop",
    body: `
      ${header(null)}
      <main>
        <section class="hero">
          <h1>That link didn't work.</h1>
        </section>
        <div class="error" style="margin-top:1.25rem">
          <b>${escapeHtml(message)}</b>
          Go back to Discord and run <code>!shop</code> to get a fresh personal link.
        </div>
      </main>
    `,
  });
}

export function handleShopGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): boolean {
  if (url.pathname !== "/shop" && url.pathname !== "/shop/") return false;

  const uid = url.searchParams.get("uid");
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const hasParams = Boolean(uid || exp || sig);

  if (!hasParams) {
    send(
      res,
      200,
      shopPage({ uid: null, exp: null, sig: null, checkoutReady: false }),
    );
    return true;
  }

  const verified = verifyShopLink({ uid, exp, sig });
  if (!verified.ok) {
    send(res, 403, errorPage(verified.error));
    return true;
  }

  send(
    res,
    200,
    shopPage({
      uid: verified.uid,
      exp: verified.exp,
      sig: verified.sig,
      checkoutReady: true,
    }),
  );
  return true;
}

export function handleShopBuyGet(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): boolean {
  if (url.pathname !== "/shop/buy" && url.pathname !== "/shop/buy/") {
    return false;
  }

  const verified = verifyShopLink({
    uid: url.searchParams.get("uid"),
    exp: url.searchParams.get("exp"),
    sig: url.searchParams.get("sig"),
  });
  if (!verified.ok) {
    send(res, 403, errorPage(verified.error));
    return true;
  }

  const tierRaw = (url.searchParams.get("tier") ?? "").toLowerCase();
  if (!isShopTier(tierRaw)) {
    send(res, 400, errorPage("Unknown role tier."));
    return true;
  }
  const tier: ShopTier = tierRaw;

  const paymentLink = paymentLinkForTier(tier);
  if (!paymentLink) {
    send(
      res,
      503,
      errorPage(
        `${tier.toUpperCase()} checkout is not configured yet. Ask staff to set the Stripe Payment Link.`,
      ),
    );
    return true;
  }

  const checkout = stripeCheckoutUrl(paymentLink, verified.uid);
  res.writeHead(302, {
    Location: checkout,
    "Cache-Control": "no-store",
  });
  res.end();
  return true;
}
