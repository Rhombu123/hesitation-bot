import "dotenv/config";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** First non-empty env among names, or throw listing all. */
function requiredAny(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(
    `Missing required environment variable (set one of): ${names.join(", ")}`,
  );
}

function optional(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** First non-empty optional env among names. */
function optionalFirst(...names: string[]): string | undefined {
  for (const name of names) {
    const value = optional(name);
    if (value) return value;
  }
  return undefined;
}

/** Public helper for optional env flags (e.g. LTOP_USE_IMAGE). */
export function optionalEnv(name: string): string | undefined {
  return optional(name);
}

/** Embed sidebar color — #143B96 (used by every bot embed). */
export const EMBED_COLOR = 0x143b96;

/** @deprecated Use EMBED_COLOR — kept as alias so older imports stay white. */
export const GAME_EMBED_COLOR = EMBED_COLOR;

/** @deprecated Use EMBED_COLOR — kept as alias so older imports stay white. */
export const POINTS_EMBED_COLOR = EMBED_COLOR;

/** @deprecated Use EMBED_COLOR — kept as alias so older imports stay white. */
export const CREDITS_EMBED_COLOR = EMBED_COLOR;

/** Level → Discord role ID rewards (cumulative — keep all earned). */
export const LEVEL_ROLES: ReadonlyArray<{ level: number; roleId: string }> = [
  { level: 5, roleId: "1508630338715254884" },
  { level: 10, roleId: "1508630247783006298" },
  { level: 20, roleId: "1508630190966833193" },
  { level: 30, roleId: "1513271650144092200" },
  { level: 40, roleId: "1513272294682923228" },
  { level: 50, roleId: "1513272702670999772" },
];

/** Custom emoji markdown for currency points (blue gem). */
export const POINTS_EMOJI = "<:point:1533274681694490735>";

/** CDN URL for the points emoji (embed thumbnails). */
export const POINTS_EMOJI_URL =
  "https://cdn.discordapp.com/emojis/1533274681694490735.png?size=256&quality=lossless";

/** Reputation give notification arrows (custom server emojis). */
export const REP_UP_EMOJI = "<:repup:1533177561335464207>";
export const REP_DOWN_EMOJI = "<:repdown:1533177681880023071>";

/** Roles allowed to use staff XP commands (`!addxp`). */
export const ADD_XP_ROLE_IDS: ReadonlySet<string> = new Set([
  "1517032221796597830", // Senior Mod
  "1508574808651206726",
  "1508577085457961000",
]);

/** Senior Mod — `!games` menu yes; direct `!flag` / `!react` / etc. no. */
export const SENIOR_MOD_ROLE_ID = "1517032221796597830";

/**
 * Add-XP staff roles that may also use direct spawn commands (`!flag`, …).
 * Excludes Senior Mod (menu via `!games` only).
 */
export const GAME_SPAWN_STAFF_ROLE_IDS: ReadonlySet<string> = new Set(
  [...ADD_XP_ROLE_IDS].filter((id) => id !== SENIOR_MOD_ROLE_ID),
);

/**
 * Roles treated as bot staff (`isStaffMember`) in addition to Admin / Manage Server.
 * Includes add-XP staff roles only — see `canSpawnGames` / uwuify for narrower checks.
 */
export const STAFF_ROLE_IDS: ReadonlySet<string> = new Set([
  ...ADD_XP_ROLE_IDS,
]);

/**
 * Extra roles that can use `!quote` (on top of boosters / L20+ / VIP tiers).
 * Includes the two requested roles plus the three staff roles that spawn games.
 */
export const QUOTE_ROLE_IDS: ReadonlySet<string> = new Set([
  "1508581365090619564",
  "1522856909495992330",
  ...ADD_XP_ROLE_IDS,
]);

/** Roles that can use `!games` in addition to Supreme / game-spawn staff. */
export const GAMES_SPAWN_ROLE_IDS: ReadonlySet<string> = new Set([
  "1508581365090619564", // Moderator
]);

/** Users who can never gain or lose reputation (manual or games). */
export const REP_IMMUNE_USER_IDS: ReadonlySet<string> = new Set([
  // empty — add user IDs here to block them from receiving rep
]);

/**
 * These users only earn XP / levels in the main Hesitation guild.
 * XP from any other guild the bot is in is ignored.
 */
export const MAIN_SERVER_XP_ONLY_USER_IDS: ReadonlySet<string> = new Set([
  "1453443494411636913",
]);

export const config = {
  token: required("DISCORD_TOKEN"),
  clientId: optional("DISCORD_CLIENT_ID") ?? "1529146940787523715",
  /**
   * Main Hesitation guild. Used for MAIN_SERVER_XP_ONLY_USER_IDS.
   * If unset, resolved at runtime from the games channel.
   */
  mainGuildId: optional("MAIN_GUILD_ID"),
  supabaseUrl: required("SUPABASE_URL"),
  /**
   * Secret / service_role key (bypasses RLS). Dashboard may label this
   * "secret" or "service_role". Do not use the publishable/anon key.
   */
  supabaseSecretKey: requiredAny(
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ),
  /**
   * Direct Postgres URL (Supabase pooler or direct).
   * Prefer the transaction pooler URI (port 6543) for the bot.
   */
  databaseUrl: requiredAny("DATABASE_URL", "SUPABASE_DB_URL"),
  /** Railway Redis — cooldowns + cross-replica locks. */
  redisUrl: required("REDIS_URL"),
  levelUpChannelId: optional("LEVEL_UP_CHANNEL_ID"),
  /**
   * Chat Star — Lounge 1 (yesterday's `!ltop 1` #1).
   * Defaults to the Hesitation "Chat Star" role.
   */
  topMessengerRoleId:
    optional("TOP_MESSENGER_ROLE_ID") ?? "1532142740844839162",
  /** Chat Star — Lounge 2 (yesterday's `!ltop 2` #1). */
  lounge2ChatStarRoleId:
    optional("LOUNGE2_CHAT_STAR_ROLE_ID") ?? "1534431726678315148",
  /** Lounge channels for per-channel message leaderboards. */
  lounge1ChannelId:
    optional("LOUNGE1_CHANNEL_ID") ?? "1483162190235177083",
  lounge2ChannelId:
    optional("LOUNGE2_CHANNEL_ID") ?? "1534419578149539870",
  /**
   * Channels where GIF / custom action commands are allowed.
   * Defaults to Lounge 1 + Lounge 2.
   * Override with ACTION_CHANNEL_IDS=id1,id2
   */
  actionChannelIds: (() => {
    const raw = optional("ACTION_CHANNEL_IDS");
    if (raw) {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [
      optional("LOUNGE1_CHANNEL_ID") ?? "1483162190235177083",
      optional("LOUNGE2_CHANNEL_ID") ?? "1534419578149539870",
    ];
  })(),
  /**
   * Opt-in only: keep Chat Star on manual holders (testing).
   * Default is exclusive — only yesterday's lounge #1 keeps the role.
   * Set CHAT_STAR_ALLOW_MANUAL=true to disable stripping (not recommended).
   */
  chatStarAllowManual: optional("CHAT_STAR_ALLOW_MANUAL") === "true",
  /**
   * Weekly #1 roles — Genius (points) / Popular (rep).
   * Hardcoded premade server roles — never override, rename-match, or recreate.
   */
  geniusRoleId: "1533243973190160519",
  popularRoleId: "1533243974792380587",
  /**
   * Channels for persistent weekly boards (posted once, edited daily).
   * Users cannot summon the boards with commands — they only appear here.
   */
  geniusLeaderboardChannelId:
    optional("GENIUS_LEADERBOARD_CHANNEL_ID") ?? "1533498766529663179",
  popularLeaderboardChannelId:
    optional("POPULAR_LEADERBOARD_CHANNEL_ID") ?? "1533499012894818417",
  /** Weekly #1 find-value role (shown in `!inv` rankings). */
  collectorRoleId:
    optional("COLLECTOR_ROLE_ID") ?? "1542670812073431171",
  /** Weekly #1 custom-role boosts — unlocks gradient on the winner's custom role. */
  hesitationRulerRoleId:
    optional("HESITATION_RULER_ROLE_ID") ?? "1543749879497498657",
  /**
   * Channel for Genius / Popularity / Collector / Hesitation Ruler crowning embeds.
   * Always <#1536483926070136862> unless CROWN_ANNOUNCE_CHANNEL_ID overrides.
   */
  crownAnnounceChannelId:
    optional("CROWN_ANNOUNCE_CHANNEL_ID") ?? "1536483926070136862",
  /**
   * Optional: `#apply-our-tag` channel (for docs / future auto-ensure).
   * Post the embed with staff `!postapplytag` in that channel.
   */
  applyOurTagChannelId: optional("APPLY_OUR_TAG_CHANNEL_ID"),
  /**
   * Role given automatically when a member displays this server's tag (MOON).
   */
  serverTagRoleId:
    optional("SERVER_TAG_ROLE_ID") ?? "1547441206470905926",
  /** Channel for the staff application embed (`!poststaffapp`). */
  staffApplicationChannelId:
    optional("STAFF_APPLICATION_CHANNEL_ID") ?? "1543000904561721386",
  /** Google Form linked from the staff application button. */
  staffApplicationFormUrl:
    optional("STAFF_APPLICATION_FORM_URL") ??
    "https://forms.gle/JzN7JALGHMn89Xry9",
  /** Helper staff role — triggers the helper promotion announce. */
  helperRoleId: optional("HELPER_ROLE_ID") ?? "1522856909495992330",
  /** Channel for Helper promotion embeds. */
  helperPromoChannelId:
    optional("HELPER_PROMO_CHANNEL_ID") ?? "1536483926070136862",
  /** Primary channel where mini-games + voting spawn (auto-spawn). */
  gamesChannelId:
    optional("GAMES_CHANNEL_ID") ?? "1483162190235177083",
  /**
   * Channels where `!games` / manual game commands are allowed.
   * Defaults to games channel + Lounge 2.
   * Override with GAMES_CHANNEL_IDS=id1,id2
   */
  gamesChannelIds: (() => {
    const raw = optional("GAMES_CHANNEL_IDS");
    if (raw) {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    const primary = optional("GAMES_CHANNEL_ID") ?? "1483162190235177083";
    const lounge2 =
      optional("LOUNGE2_CHANNEL_ID") ?? "1534419578149539870";
    return [...new Set([primary, lounge2])];
  })(),
  /** Channel where `!level` / `!credits` are allowed (staff can use anywhere). */
  levelCommandChannelId:
    optional("LEVEL_COMMAND_CHANNEL_ID") ?? "1533546615971774464",
  /** Quiet sob board — messages with 5+ 😭 reactions are forwarded here (thread). */
  sobboardThreadId:
    optional("SOBBOARD_THREAD_ID") ?? "1535329152247406632",
  /** Channel for “X just boosted!” perk announcements. */
  boostAnnounceChannelId:
    optional("BOOST_ANNOUNCE_CHANNEL_ID") ?? "1509291963269120271",
  /** Channel for VIP / Elite / Supreme credit-purchase donation embeds. */
  donationChannelId:
    optional("DONATION_CHANNEL_ID") ?? "1535439691447279769",
  /**
   * Channel for the auto `!shop`-style promo embed (every 2 hours).
   * Defaults to main chat (same as bump reminder).
   */
  shopPromoChannelId:
    optional("SHOP_PROMO_CHANNEL_ID") ?? "1483162190235177083",
  /** Donor info channel — persistent Supreme command list embed. */
  donorInfoChannelId:
    optional("DONOR_INFO_CHANNEL_ID") ?? "1535439012725006507",
  /**
   * Hesitation Appeals guild — no XP / level-ups, action commands, or game spawns.
   * If unset, resolved at runtime from the appeals rules channel.
   */
  appealsGuildId: optional("APPEALS_GUILD_ID"),
  /** Appeals rules + “how to open a ticket” embed channel. */
  appealsRulesChannelId:
    optional("APPEALS_RULES_CHANNEL_ID") ?? "1546248507516649524",
  /** Appeals FAQ embed channel. */
  appealsFaqChannelId:
    optional("APPEALS_FAQ_CHANNEL_ID") ?? "1546248449672880308",
  /** Channel linked by “Open A Ticket” buttons (ticket panel). */
  appealsTicketsChannelId:
    optional("APPEALS_TICKETS_CHANNEL_ID") ?? "1546249647780012123",
  /** Optional permanent invite to the main Hesitation server (FAQ button). */
  mainServerInviteUrl: optional("MAIN_SERVER_INVITE_URL"),
  /**
   * Optional external URL for legacy purchase deep-links.
   * Role shop uses SHOP_PUBLIC_URL + signed Discord links instead.
   */
  donationPurchaseUrl: optional("DONATION_PURCHASE_URL"),
  /**
   * Public base URL for the role shop (Railway domain, no trailing slash).
   * Example: https://hesitation-bot-production.up.railway.app
   */
  shopPublicUrl:
    optional("SHOP_PUBLIC_URL") ??
    "https://hesitation-bot-production.up.railway.app",
  /** HMAC secret for bot-signed /shop?uid=&exp=&sig= links. */
  shopLinkSecret: optional("SHOP_LINK_SECRET"),
  /** Guild where Stripe purchases grant roles (defaults to MAIN_GUILD_ID). */
  shopGuildId: optional("SHOP_GUILD_ID") ?? optional("MAIN_GUILD_ID"),
  /** Stripe secret key (webhook construct + payment link retrieve). */
  stripeSecretKey: optionalFirst("STRIPE_SECRET_KEY", "STRIPE_API_KEY"),
  stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
  stripePaymentLinkVip: optional("STRIPE_PAYMENT_LINK_VIP"),
  stripePaymentLinkElite: optional("STRIPE_PAYMENT_LINK_ELITE"),
  stripePaymentLinkSupreme: optional("STRIPE_PAYMENT_LINK_SUPREME"),
  stripePaymentLinkMythic: optional("STRIPE_PAYMENT_LINK_MYTHIC"),
  /** Optional Payment Link ids (plink_…) for webhook tier matching. */
  stripePlinkVip: optional("STRIPE_PLINK_VIP"),
  stripePlinkElite: optional("STRIPE_PLINK_ELITE"),
  stripePlinkSupreme: optional("STRIPE_PLINK_SUPREME"),
  stripePlinkMythic: optional("STRIPE_PLINK_MYTHIC"),
  /** Daily +rep/−rep give limit for users with no booster/VIP/Elite/Supreme. */
  repDailyLimit: 3,
  /** Level at which each +rep gives 5 and daily gives rise to 5. */
  repBoostLevel: 60,
  repBoostAmount: 5,
  repBoostDailyLimit: 5,
  /** Mod/staff channel — DISBOARD / Discadia /bump confirmations appear here. */
  bumpDetectChannelId:
    optional("BUMP_DETECT_CHANNEL_ID") ?? "1516871404254134597",
  /**
   * Mini anti-raid — mass-join detection + temporary lockdown.
   * Alerts go to ANTI_RAID_ALERT_CHANNEL_ID (defaults to bump/mod channel).
   */
  antiRaidEnabled: optional("ANTI_RAID_ENABLED") !== "false",
  /** Joins within the window that trigger lockdown. */
  antiRaidJoinThreshold: Number(optional("ANTI_RAID_JOIN_THRESHOLD") ?? "8") || 8,
  /** Sliding window for join surge detection. */
  antiRaidWindowMs: Number(optional("ANTI_RAID_WINDOW_MS") ?? String(15_000)) || 15_000,
  /** How long auto/manual lockdown lasts. */
  antiRaidLockdownMs:
    Number(optional("ANTI_RAID_LOCKDOWN_MS") ?? String(10 * 60_000)) ||
    10 * 60_000,
  /** timeout | kick — applied to new joins during lockdown. */
  antiRaidAction: (optional("ANTI_RAID_ACTION") === "kick" ? "kick" : "timeout") as
    | "timeout"
    | "kick",
  /** Timeout length when action is timeout. */
  antiRaidTimeoutMs:
    Number(optional("ANTI_RAID_TIMEOUT_MS") ?? String(60 * 60_000)) ||
    60 * 60_000,
  /**
   * During a join surge/lockdown, treat accounts younger than this (days)
   * as higher risk. Set 0 to disable age weighting in reasons.
   */
  antiRaidMinAccountAgeDays:
    Number(optional("ANTI_RAID_MIN_ACCOUNT_AGE_DAYS") ?? "3") || 0,
  antiRaidAlertChannelId: optional("ANTI_RAID_ALERT_CHANNEL_ID"),
  /** Main chat — bump reminder embed is posted here every 2h after a bump. */
  bumpReminderChannelId:
    optional("BUMP_REMINDER_CHANNEL_ID") ?? "1483162190235177083",
  /** XP granted when someone successfully bumps via DISBOARD. */
  bumpXpReward: Number(optional("BUMP_XP_REWARD") ?? "100") || 100,
  prefix: "!",
  messageXpMin: 15,
  messageXpMax: 25,
  messageCooldownMs: 60_000,
  /** Cooldown between social action commands (`!hug`, `!kiss`, …) per user. */
  actionCooldownMs: 5_000,
  /** Arcane-style voice XP: grant every 3 minutes while eligible. */
  voiceXpPerMinute: 4,
  voiceTickMs: 180_000,
  /** Auto-spawn mini-games when this many unique chatters are active. */
  flagGameMinChatters: 2,
  /** How long recent chatters count as "active" for auto-spawn. */
  flagGameActivityWindowMs: 5 * 60_000,
  /** Minimum time between auto-spawned games per channel. */
  flagGameAutoCooldownMs: 4 * 60 * 60_000,
  /** Seconds to guess before the round ends. */
  flagGameTimeoutSec: 30,
  /** Seconds to guess a language before the round ends. */
  langGameTimeoutSec: 60,
  /** Currency points awarded for a correct flag guess. */
  flagGameCurrencyReward: 1,
  /** Klipy API key — action GIFs (especially custom `!anything`). */
  klipyApiKey: optionalFirst(
    "KLIPY_API_KEY",
    "KLIPPY_API_KEY",
    "GIPHY_API_KEY",
  ),
  emojis: {
    info: parseEmoji("EMOJI_INFO", "info"),
    up: parseEmoji("EMOJI_UP", "up"),
    xp: parseEmoji("EMOJI_XP", "xp"),
    chat: parseEmoji("EMOJI_CHAT", "chat"),
  },
};

/**
 * Parse a custom emoji env value (`name:id`, or a raw id) into Discord emoji
 * markdown. Invalid values warn once at startup and fall back to Unicode.
 */
function parseEmoji(envName: string, defaultName: string): string | undefined {
  const raw = optional(envName);
  if (!raw) return undefined;
  const [name, id] = raw.includes(":") ? raw.split(":") : [defaultName, raw];
  if (name && id && /^\d{15,21}$/.test(id)) return `<:${name}:${id}>`;
  console.warn(
    `[config] ${envName} has invalid value "${raw}" — expected name:id. Falling back to Unicode emoji.`,
  );
  return undefined;
}

/** Get the configured custom emoji markdown for a key, else the Unicode fallback. */
export function emoji(key: keyof typeof config.emojis, fallback: string): string {
  return config.emojis[key] ?? fallback;
}
