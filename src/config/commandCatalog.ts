/**
 * Single source of truth for user-facing commands shown in `!coms`.
 * When you add a new bot command, add it here too.
 */

export type ComsAudience =
  | "everyone"
  | "chatstar"
  | "supreme"
  | "mythic"
  | "staff";

export type ComsEntry = {
  /** Primary invocation shown in help, e.g. `!quote` */
  usage: string;
  blurb: string;
  section:
    | "personal"
    | "stats"
    | "games"
    | "staff"
    | "gif"; // gif section is built from ACTIONS dynamically
  audience?: ComsAudience;
};

/** Non-GIF commands. GIF actions come from `ACTIONS` + privilege filters. */
export const COMS_CATALOG: readonly ComsEntry[] = [
  // Personalization
  {
    usage: "`!level`",
    blurb: "View your level / XP (toggle server & DM level-up notifs)",
    section: "personal",
  },
  {
    usage: "`!credits`",
    blurb: "View & redeem credits",
    section: "personal",
  },
  {
    usage: "`!loot`",
    blurb: "Browse ultra-rare earnable loot roles",
    section: "personal",
  },
  {
    usage: "`!find`",
    blurb: "Pull a random deal from the archives (15m cooldown)",
    section: "personal",
  },
  {
    usage: "`!inventory` / `!inv`",
    blurb: "Home stats, item list, and weekly find rankings (buttons)",
    section: "personal",
  },
  {
    usage: "`!anything @user`",
    blurb: "Custom GIF action (Supreme / Mythic — not counted on !stat)",
    section: "personal",
    audience: "supreme",
  },
  {
    usage: "`!points`",
    blurb: "View game points",
    section: "personal",
  },
  {
    usage: "`!messages`",
    blurb: "View message counts",
    section: "personal",
  },
  {
    usage: "`!rep` / `+rep` / `-rep`",
    blurb: "Reputation",
    section: "personal",
  },
  {
    usage: "`!quote`",
    blurb: "Quote a replied message (boosters, L20+, VIP/Elite/Supreme, quote roles)",
    section: "personal",
  },
  {
    usage: "`!troll`",
    blurb: "List Mythic troll commands (uwuify + invisible)",
    section: "personal",
    audience: "mythic",
  },
  {
    usage: "`!uwuify @user [1min|2h|3d|1w]` / `!uwu @user stop`",
    blurb: "Uwuify someone in lounges (Mythic ≤1min + 15m CD; add-XP staff up to 30d)",
    section: "personal",
    audience: "mythic",
  },
  {
    usage: "`!invisible @user [2min|2h|3d|1w]` / `!invisible @user stop`",
    blurb: "Blank their lounge messages (Mythic ≤2min + 15m CD; add-XP staff up to 30d)",
    section: "personal",
    audience: "mythic",
  },
  {
    usage: "`!coms`",
    blurb: "Commands you can use",
    section: "personal",
  },
  {
    usage: "`!edit`",
    blurb: "Customize your Chat Star role",
    section: "personal",
    audience: "chatstar",
  },
  {
    usage: "`!role overview`",
    blurb: "Browse custom roles (creators, members, or boost leaderboard)",
    section: "personal",
  },
  {
    usage: "`!shop`",
    blurb: "Open your personal Stripe role shop link (VIP / Elite / Supreme / Mythic)",
    section: "personal",
  },
  {
    usage: "`!boost @supreme` / `!boost all @supreme`",
    blurb: "Boost a Supreme custom role (1/day; VIP 3, Elite 5, Supreme 10, Mythic 26)",
    section: "personal",
  },
  {
    usage: "`!bless @user`",
    blurb: "Grant a timed XP blessing (VIP 2×/3, Elite 3×/5, Supreme 5×/10, Mythic 10×/15 per day)",
    section: "personal",
  },
  {
    usage: "`.set` / `!set <server emoji>`",
    blurb: "Set server emojis that auto-react when you're pinged (Elite+)",
    section: "personal",
  },
  {
    usage: "`!jail` / `!jail @user`",
    blurb: "Start a jail vote (Mythic) or view jail overview",
    section: "personal",
  },
  {
    usage: "`!bail @user`",
    blurb: "Bail someone out of jail (1,000 credits)",
    section: "personal",
  },
  {
    usage: "`!immunity`",
    blurb: "View jail immunity status or equip/gift tokens",
    section: "personal",
  },
  {
    usage: "`!role setup`",
    blurb: "Create / edit your custom role",
    section: "personal",
    audience: "supreme",
  },
  {
    usage: "`!role manage`",
    blurb: "Show or hide gifted custom roles",
    section: "personal",
  },
  {
    usage: "`!role give @user`",
    blurb: "Share your custom role",
    section: "personal",
    audience: "supreme",
  },
  {
    usage: "`!role removeme`",
    blurb: "Remove a shared custom role",
    section: "personal",
  },

  // Stats
  {
    usage: "`!ltop 1`",
    blurb: "Lounge 1 daily message leaderboard",
    section: "stats",
  },
  {
    usage: "`!ltop 2`",
    blurb: "Lounge 2 daily message leaderboard",
    section: "stats",
  },
  {
    usage: "`!stat`",
    blurb: "Action receive stats",
    section: "stats",
  },
  {
    usage: "`!actions` / `!top hug`",
    blurb: "Top 10 most-received per action (arrows to browse)",
    section: "stats",
  },
  {
    usage: "`!leaderboard`",
    blurb: "Level leaderboard (top 10)",
    section: "stats",
  },

  // Games (staff start; anyone can play)
  {
    usage: "`!flag`",
    blurb: "Guess the flag",
    section: "games",
  },
  {
    usage: "`!lang`",
    blurb: "Guess the language",
    section: "games",
  },
  {
    usage: "`!color`",
    blurb: "Pick the right color",
    section: "games",
  },
  {
    usage: "`!green`",
    blurb: "Red light / green light",
    section: "games",
  },
  {
    usage: "`!vote`",
    blurb: "Who deserves rep",
    section: "games",
  },
  {
    usage: "`!crate`",
    blurb: "Mysterious crate",
    section: "games",
  },
  {
    usage: "`!prizes` / `!rewards`",
    blurb: "Game prize rarities (credits, rep, loot drop rates)",
    section: "games",
  },
  {
    usage: "`!eq`",
    blurb: "Solve the emoji equation",
    section: "games",
  },
  {
    usage: "`!back`",
    blurb: "Type the word backwards",
    section: "games",
  },
  {
    usage: "`!state`",
    blurb: "Type the statement exactly",
    section: "games",
  },
  {
    usage: "`!emoji`",
    blurb: "First to send the shown emoji",
    section: "games",
  },
  {
    usage: "`!dice`",
    blurb: "Dice roll race",
    section: "games",
  },
  {
    usage: "`!react`",
    blurb: "First to react",
    section: "games",
  },
  {
    usage: "`!react`",
    blurb: "First to react wins",
    section: "games",
  },
  {
    usage: "`!nick <name>` / `!nickname <name>`",
    blurb: "Change your server nickname",
    section: "personal",
  },
  {
    usage: "`!nickgame`",
    blurb: "First to change nickname to the challenge name (points only)",
    section: "games",
  },
  {
    usage: "`!knowledge`",
    blurb: "Category quiz (4 choices)",
    section: "games",
  },
  {
    usage: "`!games` / `!game`",
    blurb: "Drop any game from a menu in Lounge 1 or 2 (Supreme / Mod / Senior Mod / staff, 30m cooldown)",
    section: "games",
    audience: "supreme",
  },
  {
    usage: "`!random` / `!rng`",
    blurb: "Drop a random game in Lounge 1 or 2 (same access + 30m cooldown as `!games`)",
    section: "games",
    audience: "supreme",
  },

  // Staff
  {
    usage: "`!addxp` / `!removexp`",
    blurb: "Adjust XP",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!give vip|elite|supreme @user`",
    blurb: "Bot-tracked paid role (30 days)",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!remove vip|elite @user`",
    blurb: "Revoke bot-tracked VIP/Elite early",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!removesupreme @user`",
    blurb: "Revoke bot-tracked Supreme early",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!postapplytag`",
    blurb: "Post apply-our-tag embed",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!poststaffapp`",
    blurb: "Post staff application embed",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!lockdown` [minutes]",
    blurb: "Start anti-raid lockdown (timeout/kick new joins)",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!unlock`",
    blurb: "End anti-raid lockdown early",
    section: "staff",
    audience: "staff",
  },
  {
    usage: "`!raidstatus`",
    blurb: "View anti-raid lockdown / join surge status",
    section: "staff",
    audience: "staff",
  },
] as const;
