# Hesitation Bot

Discord XP + level tracker with a **daily** message leaderboard. Built with Node.js, discord.js, and **Supabase**. Deployed on **Railway**.

## Features

| Command | Aliases | Description |
|---------|---------|-------------|
| `!level [member]` | `!rank`, `!xp`, `!lvl`, `!lvls` | Progress overview + milestone rewards |
| `!messages [member]` | `!msgs`, `!msg`, `!mcount`, `!messagecount` | Today's + all-time message counts |
| `!flag` | `!flaggame`, `!flags`, `!guessflag` | Flag guessing game (also auto-spawns) |
| `!ltop` | — | Top 10 message senders **today (UTC)** |

`!ltop` uses a **text embed** by default (Discord often blocks file uploads for unverified bots — error `400001`). Upload `assets/ranks/1.png`–`10.png` as server emojis named `ltop1`…`ltop10` to show your star icons. Set `LTOP_USE_IMAGE=true` only if uploads work in your server.

| `!addxp <amount> [@member]` | `!axp`, `!givexp` | Staff-only: grant XP (self or member) |

Staff roles for `!addxp`: `1517032221796597830`, `1508574808651206726`, `1508577085457961000`.

### Level roles

When a member reaches these levels, the bot assigns the matching role (keeps all earned roles):

| Level | Role ID |
|------:|---------|
| 5 | `1508630338715254884` |
| 10 | `1508630247783006298` |
| 20 | `1508630190966833193` |
| 30 | `1513271650144092200` |
| 40 | `1513272294682923228` |
| 50 | `1513272702670999772` |

The bot needs **Manage Roles**, and its role must sit **above** these roles in Server Settings → Roles.


- Earn XP from chat (15–25 XP, 60s cooldown) and voice (~12 XP every 3 minutes while unmuted, not deafened, not AFK)
- **Arcane Exponential** level curve: `5·L² + 50·L + 75` XP to reach level L

- Level-up pings in a dedicated channel (`#ADD8E6` embeds)
- Daily `!ltop` counts live in Postgres — they survive redeploys and GitHub pushes

## Quick start (local)

### 1. Environment

Copy `.env.example` to `.env` (or keep your existing `.env`) and set:

```env
DISCORD_TOKEN=...
DISCORD_CLIENT_ID=1529146940787523715
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
LEVEL_UP_CHANNEL_ID=            # add after you create the channel
```

### 2. Supabase setup (API — no Prisma)

1. Create a project at [supabase.com](https://supabase.com) (or use an existing one)
2. **Project Settings → API** → copy **Project URL** → `SUPABASE_URL`
3. Same page → **service_role** key (secret) → `SUPABASE_SERVICE_ROLE_KEY`  
   Do **not** use the `anon` key in this bot.
4. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql), **Run** once  
   (creates tables + RPCs; keeps existing XP data if tables already exist)

```bash
npm install
```
### 3. Run the bot

```bash
npm run dev
# or
npm run build && npm start
```

Invite URL (permissions for this bot):

https://discord.com/api/oauth2/authorize?client_id=1529146940787523715&permissions=378944&scope=bot

Enable in the Developer Portal → Bot → Privileged Gateway Intents:

- Message Content Intent
- Server Members Intent

> ⚠️ **The bot will crash on startup without these.** If you see
> `Used disallowed intents` (or the login fails immediately), it means the
> Message Content and/or Server Members privileged intents are not enabled for
> your application. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
> → your app → **Bot** → **Privileged Gateway Intents**, toggle both on, save,
> and restart the bot.

## Custom emoji icons

PNG assets are in [`assets/emojis/`](assets/emojis/):

| File | Env var | Suggested name |
|------|---------|----------------|
| `info.png` | `EMOJI_INFO` | `info` |
| `up.png` | `EMOJI_UP` | `up` |
| `xp.png` | `EMOJI_XP` | `xp` |
| `chat.png` | `EMOJI_CHAT` | `chat` |

Upload them as **Server Emojis** (or Application Emojis), then set env values as `name:id`:

```env
EMOJI_INFO=info:1234567890123456789
EMOJI_UP=up:1234567890123456789
EMOJI_XP=xp:1234567890123456789
EMOJI_CHAT=chat:1234567890123456789
```

If unset, the bot falls back to Unicode emojis.

Level numbers in level-up messages use generic keycaps (`1️⃣`, `2️⃣`, …) — not the custom star rank emojis.

## Level-up channel

1. Create a channel (e.g. `#level-ups`)
2. Enable Developer Mode → right-click channel → Copy Channel ID
3. Set `LEVEL_UP_CHANNEL_ID` and restart the bot

Until this is set, XP and levels still work; announcements are skipped.

## Deploy on Railway

Fly’s trial was stopping the bot after 5 minutes — use **Railway** instead.

### 1. Create the project

1. Go to [railway.app](https://railway.app) and sign in (GitHub is easiest)
2. **New Project → Deploy from GitHub repo** (this repo), or empty project + CLI
3. Railway will build from the `Dockerfile`

### 2. Set environment variables

In the Railway service → **Variables**, add:

| Variable | Value |
|----------|--------|
| `DISCORD_TOKEN` | your bot token |
| `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key (Settings → API) |
| `LEVEL_UP_CHANNEL_ID` | your level-up channel ID |
| `DISCORD_CLIENT_ID` | `1529146940787523715` |

You can remove old `DATABASE_URL` — Prisma is gone; the bot uses the Supabase JS client.

### 3. Deploy / redeploy

**Dashboard:** push to GitHub (if connected) or click **Deploy**

**CLI:**
```bash
npm i -g @railway/cli
railway login
railway link          # select the project
railway up -m "Deploy hesitation-bot"
railway logs
```

### 4. Confirm it’s online

In Railway logs you should see:
```text
[ready] Logged in as lara#5031
```

Stop local `npm run dev` when Railway is running so you don’t have two bots.

### Optional: stop the old Fly app

**Required if you still see double replies.** This repo used to run on Fly; if that
app is still up, Discord delivers every message to *both* Fly and Railway.

```bash
fly auth login
fly apps destroy hesitation-bot
```

Railway is configured for **1 replica** — doubles mean a second host still has the bot token.

## XP rules

- **Messages:** random 15–25 XP, one grant per user per guild per 60 seconds; every message still increments today's `!ltop` count
- **Voice:** +5 XP every 60 seconds while in VC, unmuted, undeafened, not in the AFK channel
- **Level curve (Arcane Exponential):** XP to go from level `L-1` → `L` is `5·L² + 50·L + 75`

## Project layout

```
src/
  index.ts
  config.ts
  db/           # Supabase client
  commands/     # !level, !ltop, !flag, !rep, +rep/-rep
  events/       # messages, voice
  services/     # XP, daily counts, reputation, voice ticker
  utils/
supabase/       # schema.sql (run once in SQL Editor)
assets/emojis/
```
