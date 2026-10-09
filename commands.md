# Hesitation Bot — Commands

Prefix: `!`

---

## Everyone

| Command | Aliases | Usage | What it does |
|---------|---------|--------|----------------|
| `!level` | `!rank`, `!xp`, `!lvl`, `!lvls` | `!level` or `!level @user` | Progress overview + milestones — **only in** `<#1533546615971774464>` (staff can use anywhere) |
| `!credits` | `!credit`, `!redeem` | `!credits` | Credit balance + redeem catalog — **only in** `<#1533546615971774464>` (staff can use anywhere) |
| `!rep` | `!reputation`, `!reps`, also `.rep` | `!rep` or `!rep @user` | Your reputation, or someone else's |
| `!points` | `!point`, `!balance`, `!currency` | `!points` or `!points @user` | Currency point balance |
| `+rep` | — | `+rep` (reply) or `+rep @user` | Give positive rep (Confirm/Cancel) — **3 per day** UTC |
| `-rep` | — | `-rep` (reply) or `-rep @user` | Give negative rep (Confirm/Cancel) — shares the daily limit |
| `!messages` | `!msgs`, `!msg`, `!mcount`, `!messagecount` | `!messages` or `!messages @user` | Shows today's UTC message count and all-time messages |
| `!flag` | `!flaggame`, `!flags`, `!guessflag` | `!flag` | Starts a flag round — **staff roles only** (same as `!addxp`); anyone can guess |
| `!color` | `!colour`, `!colors`, `!colorgame` | `!color` | Starts a color-pick round — **staff only**; 1 try each; wrong colors gray out |
| `!green` | `!light`, `!reaction`, `!stoplight` | `!green` | Starts wait-for-green — **staff only**; button flips green after 3–7s; first press wins |
| `!vote` | `!voting`, `!repvote`, `!votemachine` | `!vote` | Starts “Who Deserves More Rep?” — **staff only**; 2 random chatters; winner gets **+5 rep** |
| `!crate` | `!dice`, `!lootcrate` | `!crate` | Starts credit dice crate — **staff only**; highest roll wins credits by rarity |
| `!edit` | `!editrole`, `!chatstar` | `!edit` | Chat Star only — customize role color / gradient / crown / icon |
| `!ltop` | — | `!ltop` | Daily message leaderboard (top 10, resets 00:00 UTC) |
| `!leaderboard` | `!lb`, `!levels`, `!toplevel`, `!top` | `!leaderboard` | Top 10 highest level users (XP as tiebreaker) |
| `!stat` | `!stats`, `!actions` | `!stat` or `!stat @user` | Action receive counts, most → least |

All embeds use a **white** sidebar.

**Weekly boards (not commands):** Genius in `<#1533498766529663179>`, Most Popular in `<#1533499012894818417>` — posted once each, updated live when points / +rep change, re-found on bot restart (only re-sent if deleted). At **Monday 00:00 UTC**, last week's #1 gets **Genius** / **Popular**.

**Persistence:** XP, levels, currency points, and reputation are stored by Discord user ID. Leaving and rejoining the server does **not** reset them. Level roles are re-applied automatically on rejoin.

### Flag guessing game

- **Command:** `!flag` posts a simple flag embed; first correct guess wins **1 currency point**.
- **Who can start:** staff roles (or Administrator / Manage Server). Anyone can still **guess**.
- **Auto-spawn:** when **3+** unique members chat in a channel within **5 minutes**, a random game (`flag` / `color` / `green` / `vote` / `crate`) can spawn (at most once every **4 minutes** per channel).
- Rounds time out after **30 seconds**.
- Win message shows weekly **rank** + a link to the Genius leaderboard channel.
- Check points with `!points`.

### Genius (weekly points)

- Posted in `<#1533498766529663179>` (not a command) — top 10 currency points this UTC week.
- Edited live when points are earned; bot reuses the same message after restarts unless an admin deletes it.
- **#1 role:** **Genius** awarded Monday 00:00 UTC to last week's winner (created if missing, or set `GENIUS_ROLE_ID`).

### Most Popular (weekly rep)

- Same style as Genius, posted in `<#1533499012894818417>` — top 10 positive reputation received this UTC week.
- **#1 role:** **Popular** awarded Monday 00:00 UTC to last week's winner (created if missing, or set `POPULAR_ROLE_ID`).

### Color pick game

- **Command:** `!color` — Socialize-style “Which color is it?” with 6 color buttons.
- Correct color is random each round. **1 try per person.**
- Wrong pick grays that color out for everyone; correct pick awards **1 point** + win embed.
- Round times out after **60 seconds**.
- Also appears via the shared **4 min** random auto-spawn.

### Wait for green (Red Light Green Light)

- **Command:** `!green` — mysterious crate embed; button flips red → green after a random **3–7 seconds**.
- Pressing while red = out for that round. First press on green wins.
- Each round picks a **rarity** (same weights/ranges as dice crates) and randomly awards **credits** or **points** in that range:
  - **Common** 5–15 · **Uncommon** 15–25 · **Rare** 25–35 · **Epic** 35–50
- Green window lasts **20 seconds**, then the button shows **Expired**.
- Also appears via the shared **4 min** random auto-spawn.

### Voting machine (Who Deserves More Rep?)

- **Command:** `!vote` — picks **2** people from ~**3–5** active chatters.
- Everyone can vote (**one ballot**; no switching). After **45 seconds**, most votes wins **+5 rep**.
- Ties are broken randomly. Also appears via the shared **4 min** random auto-spawn (needs 3+ chatters).

### Credit dice crate

- **Command:** `!crate` (also `!dice`) — mysterious crate; everyone rolls a d6 within **45 seconds**.
- Highest roll wins credits based on rarity (ties → random among top rollers). A natural **6** wins instantly and posts a congratulations embed.
  - **Common** 5–15 · **Uncommon** 15–25 · **Rare** 25–35 · **Epic** 35–50
- Rarity is weighted (Common most often, Epic rarest). Also auto-spawns with other games.

### Level milestones (`!level`)

Only works in `<#1533546615971774464>` (staff can use anywhere). Shows **X / Y XP** as numbers (no progress bar).

### Credits (`!credits`)

Only works in `<#1533546615971774464>` (staff can use anywhere). Shows credit balance + redeem catalog.

**Earn credits by leveling up** (random in band per level gained):

| Levels | Credits per level-up |
|--------|----------------------|
| 1–4 | 5–15 |
| 5–15 | 15–35 |
| 16–25 | 30–55 |
| 26–35 | 50–80 |
| 36–45 | 65–95 |
| 46–55 | 80–115 |
| 56–65 | 95–135 |
| 66–75 | 110–155 |
| 76–85 | 130–180 |
| 86–100 | 150–210 |

Also earn via the **dice crate** mini-game. Redeem shop purchases not wired yet.

### Reputation (`+rep` / `-rep` / `!rep`)

Matches the Socialize-style flow from the reference screenshots:

- **`+rep` / `-rep`** — reply to someone or `@mention` them → Confirm / Cancel buttons
- **3 gives per UTC day** — when empty, shows wait time until next UTC midnight
- **Level 70+** — each `+rep` awards **5** points instead of **1** (milestone perk)
- **`!rep`** — score + rank for most positive rep + **Reputation Log** button
- Can't rep yourself or bots

| Level | Reward |
|------:|--------|
| 5 | Ability to edit your Nickname |
| 10 | Use External Emotes |
| 20 | Unlock Streaming and Camera |
| 30 | Unlock Voice Messages |
| 40 | Unlock Soundboards & Polls |
| 50 | Post Images Anywhere |
| 60 | Access to External Sounds |
| 70 | Gain +5 per reputation given |
| 80 | Access to all action commands |
| 90 | Ability to create Threads |
| 100 | Unlock Prestige |

*(Milestone text is informational for now — server perks / credits buttons come later.)*

---

## Action commands (GIF + counter)

Ping someone (or reply to their message). Each person keeps a **receive count** per action in this server.

**7 second cooldown** per user between action commands.

Embed format (same as the classic action-bot layout):

```text
**A** hugs **B**! 🤗
**B** has now received **2** hugs!
```

Then the GIF image below — no title, footer, or thumbnail.
| Command | Aliases | Example |
|---------|---------|---------|
| `!kiss` | — | Kiss |
| `!slap` | — | Slap |
| `!kick` | — | Kick |
| `!kill` | — | Kill |
| `!hug` | — | Hug |
| `!pat` | — | Pat |
| `!poke` | — | Poke |
| `!bite` | — | Bite |
| `!cuddle` | — | Cuddle |
| `!bonk` | — | Bonk |
| `!highfive` | `!high5`, `!hf` | High Five |
| `!yeet` | — | Yeet |
| `!handhold` | `!holdhands` | Handhold |
| `!bully` | — | Bully |
| `!dap` | `!dapup`, `!fistbump` | Dap |

### Examples

```text
!kiss @Someone
!hug @Someone
!stat @Someone
!slap
```

(`!slap` works if you **reply** to their message.)

---

## Staff only (XP)

| Command | Aliases | Usage | What it does |
|---------|---------|--------|----------------|
| `!addxp` | `!axp`, `!givexp` | `!addxp <amount>` or `!addxp <amount> @user` | Grants XP (triggers level-ups / level roles if thresholds are crossed) |
| `!removexp` | `!rxp`, `!takexp` | `!removexp <amount>` or `!removexp <amount> @user` | Removes XP (floored at 0; level syncs down; roles are kept) |

### Who can use staff XP commands

You need **one** of these Discord roles (by ID), **or** Administrator / Manage Server:

| Role ID |
|---------|
| `1517032221796597830` |
| `1508574808651206726` |
| `1508577085457961000` |

### Examples

```text
!addxp 500
!addxp 50 @Someone
!removexp 100
!removexp 50 @Someone
!rxp 25 @Someone
```

Use a real Discord **@mention** for someone else.  
Max per command: **1,000,000** XP.

---

## Passive XP (no command)

| Source | Amount | Notes |
|--------|--------|--------|
| Chat messages | 15–25 XP | 60s cooldown per user; every message still counts for `!ltop` / `!messages` |
| Voice | ~12 XP / 3 min | Must be in VC, unmuted, undeafened, not in AFK channel |
| Flag game win | +1 currency point | Correct country guess (not XP / not reputation) |

### Level curve (Arcane Exponential)

XP needed to go from level `L − 1` → `L`:

`5 × L² + 50 × L + 75`

Examples: L1 = **130**, L5 = **450**, L10 = **1,075**, L20 = **3,075**.
Levels are recalculated from total XP when the bot starts.

---

## Level roles (automatic)

Granted when you reach that level (kept permanently):

| Level | Role ID |
|------:|---------|
| 5 | `1508630338715254884` |
| 10 | `1508630247783006298` |
| 20 | `1508630190966833193` |
| 30 | `1513271650144092200` |
| 40 | `1513272294682923228` |
| 50 | `1513272702670999772` |

Level-ups are announced in the channel set by `LEVEL_UP_CHANNEL_ID`.

---

## Daily top messenger role (Chat Star)

Role ID: `1532142740844839162` (**Chat Star**)

Awarded at **00:00 UTC** to whoever finished **#1** on `!ltop` for the day that just ended. They keep it for the full next UTC day — live mid-day ranking changes do **not** move the role.

- **`!edit`** — Chat Star holder opens a button panel:
  - **Status** — King / Queen of the Lounge (renames the role)
  - **Icon** — yellow / blue / red / orange crowns (applies color + crown icon on pick)
  - **Color** — custom gradient hex colors
  - **Save** — applies drafted Color changes
- **Ping reactions** — when Chat Star is `@mentioned`, the bot reacts with ✨ 🌟 💫

Put the **bot’s role above Chat Star** so it can assign and recolor it.

**Temporary:** manual Chat Star holders keep the role and can use `!edit` only if `CHAT_STAR_ALLOW_MANUAL=true`. Default is exclusive — only yesterday's `!ltop` #1 keeps it.
