import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AttachmentBuilder,
  EmbedBuilder,
  type Client,
  type Guild,
  type Message,
  type Role,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { config, POINTS_EMOJI } from "../config.js";
import {
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  INFO_EMOJI_ID,
  INFO_EMOJI_NAME,
  NUMBER_EMOJI_IDS,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { getAllTimePointsTop, getWeeklyPointsTop } from "./currency.js";
import {
  getAllTimeHatedTop,
  getAllTimeRepTop,
  getWeeklyRepTop,
} from "./reputation.js";
import {
  formatResetCountdown,
  msUntilNextUtcWeek,
  previousUtcWeekId,
  utcWeekId,
  utcWeekStart,
} from "../utils/helpers.js";
import { ltrIsolate, ltrLine } from "../utils/ltr.js";
import {
  bindWeeklyLeaderClient as bindQueueClient,
  registerWeeklyBoardRefresh,
  registerWeeklyLeaderSync,
} from "./weeklyRoleQueue.js";
import {
  clearFindInventoryNotInWeek,
  getWeeklyValueList,
  snapshotWeeklyFindLeader,
} from "./findInventory.js";
import {
  getFindWeeklyWinner,
  getWeeklyCrownAward,
  saveFindWeeklyWinner,
  upsertWeeklyCrownAward,
} from "./weeklyCrownAwards.js";
import { syncCrownAnnouncements, buildCrownAnnouncePayload } from "./crownAnnouncements.js";
import { getWeeklyBoostWinnerOwnerId, clearRoleBoostsForWeek } from "./roleBoosts.js";
import { syncWeeklyImmunityTokens } from "./jail.js";
import {
  ensureSolidCustomRoleColor,
  getCustomRoleByOwner,
} from "./customRoles.js";
import {
  getBoardPostMessageId,
  saveBoardPostMessageId,
  type BoardPostKind,
} from "./boardPosts.js";

export {
  bindWeeklyLeaderClient,
  queueWeeklyBoardRefresh,
  queueWeeklyLeaderRoleSync,
} from "./weeklyRoleQueue.js";

/** Last completed UTC week's Genius (#1 points). */
async function getPreviousWeekGeniusId(
  guildId: string,
): Promise<string | null> {
  const top = await getWeeklyPointsTop(guildId, 1, previousUtcWeekId());
  return top[0]?.userId ?? null;
}

/** Last completed UTC week's Popular (#1 positive rep). */
async function getPreviousWeekPopularId(
  guildId: string,
): Promise<string | null> {
  const completedWeekId = previousUtcWeekId();
  const since = new Date(`${completedWeekId}T00:00:00.000Z`);
  const until = utcWeekStart();
  const top = await getWeeklyRepTop(guildId, 1, { since, until });
  return top[0]?.userId ?? null;
}

function crownedWinnerLine(
  crown: string,
  title: string,
  winnerId: string | null,
): string {
  const who = winnerId ? ltrIsolate(`<@${winnerId}>`) : "_nobody yet_";
  return ltrLine(`${crown} **${title}** — ${who}`);
}

const GENIUS_COLOR = 0x143b96;
const POPULAR_COLOR = 0x143b96;
const HATED_COLOR = 0x143b96;

const GENIUS_AUTHOR = "Hesitation Game Leaderboard";
const GENIUS_ALLTIME_AUTHOR = "Hesitation All-Time Game Leaderboard";
const POPULAR_AUTHOR = "Most Popular of Hesitation Weekly";
const POPULAR_ALLTIME_AUTHOR = "All-Time Most Popular of Hesitation";
const HATED_ALLTIME_AUTHOR = "All-Time Most Hated of Hesitation";

const ASSETS = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../assets",
);
const GENIUS_THUMB = "genius-thumb.png";
const POPULAR_THUMB = "popular-thumb.png";

/** guildId → role ids we resolved/created */
const roleIdsByGuild = new Map<
  string,
  {
    geniusId: string;
    popularId: string;
    collectorId: string;
    rulerId: string;
  }
>();

/** Cached message ids for the pinned channel boards (restart re-discovers). */
let cachedGeniusMessageId: string | null = null;
let cachedGeniusAllTimeMessageId: string | null = null;
let cachedPopularMessageId: string | null = null;
let cachedPopularAllTimeMessageId: string | null = null;
let cachedHatedAllTimeMessageId: string | null = null;

async function ensureNamedRole(
  guild: Guild,
  name: string,
  color: number,
  configuredId?: string,
): Promise<Role> {
  if (configuredId) {
    const byId = await guild.roles.fetch(configuredId).catch(() => null);
    if (byId) return byId;
    throw new Error(
      `[weeklyRoles] Configured ${name} role ${configuredId} not found in guild ${guild.id}. Fix the role ID — refusing to create a duplicate.`,
    );
  }

  const byName = guild.roles.cache.find(
    (r) => r.name.toLowerCase() === name.toLowerCase(),
  );
  if (byName) return byName;

  return guild.roles.create({
    name,
    color,
    reason: `Weekly ${name} leaderboard #1 role`,
    mentionable: true,
  });
}

/** Always resolve Genius / Popular by these role IDs. Never the retired ones. */
const GENIUS_ROLE_ID = "1533243973190160519";
const POPULAR_ROLE_ID = "1533243974792380587";
const RETIRED_GENIUS_ROLE_ID = "1546395836001288234";
const RETIRED_POPULAR_ROLE_ID = "1546395836936618045";

/** Always resolve Genius / Popular by the hardcoded role IDs above. */
async function fetchRequiredRole(
  guild: Guild,
  name: string,
  roleId: string,
): Promise<Role> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    throw new Error(
      `[weeklyRoles] ${name} role ${roleId} not found in guild ${guild.id}.`,
    );
  }
  return role;
}

/** Take the old Genius / Popular roles off everyone. Those IDs must never be awarded. */
async function stripRetiredWeeklyRole(
  guild: Guild,
  roleId: string,
): Promise<void> {
  const role = await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return;

  const me = guild.members.me;
  if (!me?.permissions.has("ManageRoles") || role.position >= me.roles.highest.position) {
    console.warn(
      `[weeklyRoles] Cannot remove retired role ${role.name} (${role.id}) — move the bot role above it.`,
    );
    return;
  }

  await guild.members.fetch().catch(() => null);
  const holders = guild.members.cache.filter((m) => m.roles.cache.has(role.id));
  for (const [, member] of holders) {
    await member.roles
      .remove(role, `Retired weekly role ${role.id} — using the current Genius/Popular roles`)
      .catch((err) =>
        console.warn(
          `[weeklyRoles] Failed to remove retired ${role.id} from ${member.user.tag}:`,
          err,
        ),
      );
    console.log(
      `[weeklyRoles] Removed retired ${role.name} (${role.id}) from ${member.user.tag}`,
    );
  }
}

export async function ensureWeeklyRoles(
  guild: Guild,
): Promise<{ genius: Role; popular: Role; collector: Role; ruler: Role }> {
  // Genius + Popular are fixed IDs — never use name lookup or cached substitutes.
  const [genius, popular] = await Promise.all([
    fetchRequiredRole(guild, "Genius", GENIUS_ROLE_ID),
    fetchRequiredRole(guild, "Popular", POPULAR_ROLE_ID),
  ]);
  if (genius.id !== GENIUS_ROLE_ID || popular.id !== POPULAR_ROLE_ID) {
    throw new Error(
      `[weeklyRoles] Refusing to use unexpected Genius/Popular roles (${genius.id}, ${popular.id}).`,
    );
  }

  const cached = roleIdsByGuild.get(guild.id);
  if (
    cached &&
    cached.geniusId === genius.id &&
    cached.popularId === popular.id
  ) {
    const [collector, ruler] = await Promise.all([
      guild.roles.fetch(cached.collectorId).catch(() => null),
      guild.roles.fetch(cached.rulerId).catch(() => null),
    ]);
    if (collector && ruler) {
      return { genius, popular, collector, ruler };
    }
  }

  const collector = await ensureNamedRole(
    guild,
    "Collector",
    GENIUS_COLOR,
    config.collectorRoleId,
  );
  const ruler = await ensureNamedRole(
    guild,
    "Hesitation Ruler",
    0xfbbf24,
    config.hesitationRulerRoleId,
  );

  roleIdsByGuild.set(guild.id, {
    geniusId: genius.id,
    popularId: popular.id,
    collectorId: collector.id,
    rulerId: ruler.id,
  });
  return { genius, popular, collector, ruler };
}

async function stripCustomRoleGradient(
  guild: Guild,
  ownerId: string,
): Promise<void> {
  const custom = await getCustomRoleByOwner(guild.id, ownerId);
  if (!custom) return;
  const role = await guild.roles.fetch(custom.discordRoleId).catch(() => null);
  if (role) await ensureSolidCustomRoleColor(role);
}

type WeeklyWinnerKind = "genius" | "popular" | "collector" | "ruler";

async function sendWeeklyWinnerDm(opts: {
  guild: Guild;
  winnerId: string;
  role: Role;
  kind: WeeklyWinnerKind;
  weekAwardedId: string;
}): Promise<void> {
  const member = await opts.guild.members.fetch(opts.winnerId).catch(() => null);
  if (!member) return;

  const payload = buildCrownAnnouncePayload(opts.kind, {
    winnerId: opts.winnerId,
    roleId: opts.role.id,
    guildId: opts.guild.id,
    weekAwardedId: opts.weekAwardedId,
  });

  try {
    await member.send({
      embeds: [payload.embed],
      files: payload.files,
    });
    console.log(`[weeklyRoles] DM'd ${opts.kind} winner ${member.user.tag}`);
  } catch (err) {
    console.warn(
      `[weeklyRoles] Could not DM ${opts.kind} winner ${member.user.tag}:`,
      err,
    );
  }
}

async function notifyWeeklyWinners(opts: {
  guild: Guild;
  geniusWinner: string | null;
  popularWinner: string | null;
  collectorWinner: string | null;
  rulerWinner: string | null;
  genius: Role;
  popular: Role;
  collector: Role;
  ruler: Role;
  weekAwardedId: string;
}): Promise<void> {
  const { guild, weekAwardedId } = opts;

  if (opts.geniusWinner) {
    await sendWeeklyWinnerDm({
      guild,
      winnerId: opts.geniusWinner,
      role: opts.genius,
      kind: "genius",
      weekAwardedId,
    });
  }
  if (opts.popularWinner) {
    await sendWeeklyWinnerDm({
      guild,
      winnerId: opts.popularWinner,
      role: opts.popular,
      kind: "popular",
      weekAwardedId,
    });
  }
  if (opts.collectorWinner) {
    await sendWeeklyWinnerDm({
      guild,
      winnerId: opts.collectorWinner,
      role: opts.collector,
      kind: "collector",
      weekAwardedId,
    });
  }
  if (opts.rulerWinner) {
    await sendWeeklyWinnerDm({
      guild,
      winnerId: opts.rulerWinner,
      role: opts.ruler,
      kind: "ruler",
      weekAwardedId,
    });
  }
}

async function transferRole(opts: {
  guild: Guild;
  role: Role;
  winnerId: string | null;
  previousId: string | null;
  fullSweep: boolean;
  label: string;
}): Promise<void> {
  const { guild, role, winnerId, previousId, fullSweep, label } = opts;
  const me = guild.members.me;
  if (!me?.permissions.has("ManageRoles")) {
    console.warn(`[weeklyRoles] Missing Manage Roles — cannot move ${label}.`);
    return;
  }
  if (role.managed || role.position >= me.roles.highest.position) {
    console.warn(
      `[weeklyRoles] Cannot assign ${role.name} — move the bot role above it.`,
    );
    return;
  }

  if (fullSweep) {
    await guild.members.fetch().catch(() => null);
    const holders = guild.members.cache.filter((m) => m.roles.cache.has(role.id));
    for (const [, member] of holders) {
      if (winnerId && member.id === winnerId) continue;
      await member.roles
        .remove(role, `${label} transferred — no longer weekly #1`)
        .catch((err) =>
          console.warn(`[weeklyRoles] Remove failed for ${member.user.tag}:`, err),
        );
    }
  } else if (previousId && previousId !== winnerId) {
    const prev = await guild.members.fetch(previousId).catch(() => null);
    if (prev?.roles.cache.has(role.id)) {
      await prev.roles
        .remove(role, `${label} transferred to the new weekly #1`)
        .catch((err) =>
          console.warn(`[weeklyRoles] Remove failed for ${prev.user.tag}:`, err),
        );
    }
  }

  if (!winnerId) return;
  const winner = await guild.members.fetch(winnerId).catch(() => null);
  if (!winner) return;
  if (!winner.roles.cache.has(role.id)) {
    await winner.roles.add(role, `Weekly ${label} #1 (week ${previousUtcWeekId()})`);
    console.log(
      `[weeklyRoles] Gave ${winner.user.tag} ${role.name} (${role.id})`,
    );
  }
}

async function resolveCollectorWinner(
  guildId: string,
  weekId: string,
): Promise<string | null> {
  // Prefer live collective totals (SUM of all finds that week).
  const fromFind = await getWeeklyValueList(guildId, weekId);
  if (fromFind[0]) {
    await saveFindWeeklyWinner(
      guildId,
      weekId,
      fromFind[0].userId,
      fromFind[0].totalCents,
    );
    console.log(
      `[weeklyRoles] Collector from inventory: ${fromFind[0].userId} (${fromFind[0].totalCents}¢) week ${weekId}`,
    );
    return fromFind[0].userId;
  }

  // Inventory may already be wiped — use the snapshot saved during the week.
  const snapshot = await getFindWeeklyWinner(guildId, weekId);
  if (snapshot) {
    console.log(
      `[weeklyRoles] Collector from snapshot: ${snapshot.userId} (${snapshot.totalCents}¢) week ${weekId}`,
    );
    return snapshot.userId;
  }

  console.warn(
    `[weeklyRoles] No Collector candidate for week ${weekId} (empty inventory + no snapshot).`,
  );
  return null;
}

/**
 * Award Genius + Popular to last completed UTC week's #1s.
 * Call on Monday rollover and on ready (re-applies last week's winners).
 */
export async function syncWeeklyLeaderRoles(
  client: Client,
  guildId: string,
  opts: { fullSweep?: boolean } = {},
): Promise<void> {
  registerWeeklyLeaderSync((c, id) => syncWeeklyLeaderRoles(c, id));
  bindQueueClient(client);
  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  await stripRetiredWeeklyRole(guild, RETIRED_GENIUS_ROLE_ID);
  await stripRetiredWeeklyRole(guild, RETIRED_POPULAR_ROLE_ID);

  const { genius, popular, collector, ruler } = await ensureWeeklyRoles(guild);

  const completedWeekId = previousUtcWeekId();
  const completedWeekStart = new Date(`${completedWeekId}T00:00:00.000Z`);
  const completedWeekEnd = utcWeekStart(); // Monday of current week = end of completed week

  const persisted = await getWeeklyCrownAward(guildId);
  const awardWeekChanged =
    !persisted || persisted.awardedWeekId !== completedWeekId;
  const fullSweep = opts.fullSweep || awardWeekChanged;

  let geniusWinner: string | null;
  let popularWinner: string | null;
  let collectorWinner: string | null;
  let rulerWinner: string | null;

  if (awardWeekChanged) {
    const [pointsTop, repTop, collectorId, boostWinner] = await Promise.all([
      getWeeklyPointsTop(guildId, 1, completedWeekId),
      getWeeklyRepTop(guildId, 1, {
        since: completedWeekStart,
        until: completedWeekEnd,
      }),
      resolveCollectorWinner(guildId, completedWeekId),
      getWeeklyBoostWinnerOwnerId(guildId, completedWeekId),
    ]);
    geniusWinner = pointsTop[0]?.userId ?? null;
    popularWinner = repTop[0]?.userId ?? null;
    collectorWinner = collectorId;
    rulerWinner = boostWinner;

    await upsertWeeklyCrownAward(guildId, {
      awardedWeekId: completedWeekId,
      geniusId: geniusWinner,
      popularId: popularWinner,
      collectorId: collectorWinner,
      rulerId: rulerWinner,
    });
  } else {
    geniusWinner = persisted!.geniusId;
    popularWinner = persisted!.popularId;
    collectorWinner = persisted!.collectorId;
    rulerWinner = persisted!.rulerId;
  }

  const prev = persisted;

  await transferRole({
    guild,
    role: genius,
    winnerId: geniusWinner,
    previousId: prev?.geniusId ?? null,
    fullSweep,
    label: "Genius",
  });
  await transferRole({
    guild,
    role: popular,
    winnerId: popularWinner,
    previousId: prev?.popularId ?? null,
    fullSweep,
    label: "Popular",
  });
  await transferRole({
    guild,
    role: collector,
    winnerId: collectorWinner,
    previousId: prev?.collectorId ?? null,
    fullSweep,
    label: "Collector",
  });
  await transferRole({
    guild,
    role: ruler,
    winnerId: rulerWinner,
    previousId: prev?.rulerId ?? null,
    fullSweep,
    label: "Hesitation Ruler",
  });

  if (prev?.rulerId && prev.rulerId !== rulerWinner) {
    await stripCustomRoleGradient(guild, prev.rulerId);
  }

  if (rulerWinner) {
    const custom = await getCustomRoleByOwner(guild.id, rulerWinner);
    if (custom) {
      const customRole = await guild.roles
        .fetch(custom.discordRoleId)
        .catch(() => null);
      if (customRole) {
        // Winner just received Hesitation Ruler — do not strip their gradient.
        await ensureSolidCustomRoleColor(customRole, { allowGradient: true });
      }
    }
  }

  // Channel announce + winner DMs only on real Monday UTC week rollover
  // (never on ready / redeploy mid-week).
  if (awardWeekChanged) {
    await syncCrownAnnouncements(client, guild, {
      geniusWinnerId: geniusWinner,
      popularWinnerId: popularWinner,
      collectorWinnerId: collectorWinner,
      rulerWinnerId: rulerWinner,
      geniusRole: genius,
      popularRole: popular,
      collectorRole: collector,
      rulerRole: ruler,
      weekAwardedId: completedWeekId,
    });

    await notifyWeeklyWinners({
      guild,
      geniusWinner,
      popularWinner,
      collectorWinner,
      rulerWinner,
      genius,
      popular,
      collector,
      ruler,
      weekAwardedId: completedWeekId,
    });
  }
  if (awardWeekChanged) {
    try {
      await syncWeeklyImmunityTokens(guildId, {
        geniusWinner,
        popularWinner,
        collectorWinner,
        previousGenius: prev?.geniusId ?? null,
        previousPopular: prev?.popularId ?? null,
        previousCollector: prev?.collectorId ?? null,
      });
    } catch (err) {
      console.error("[weeklyRoles] Jail immunity sync failed:", err);
    }
    try {
      const clearedBoosts = await clearRoleBoostsForWeek(
        guildId,
        completedWeekId,
      );
      if (clearedBoosts > 0) {
        console.log(
          `[weeklyRoles] Cleared ${clearedBoosts} boost row(s) for week ${completedWeekId}.`,
        );
      }
    } catch (err) {
      console.error("[weeklyRoles] Boost reset failed:", err);
    }
    try {
      // Snapshot before wipe so a missed award still has durable totals.
      await snapshotWeeklyFindLeader(guildId, completedWeekId).catch(() => null);
      const cleared = await clearFindInventoryNotInWeek();
      if (cleared > 0) {
        console.log(`[find] Cleared ${cleared} item(s) after weekly reset.`);
      }
    } catch (err) {
      console.error("[find] Weekly inventory reset failed:", err);
    }
    console.log(
      `[weeklyRoles] Awarded week ${completedWeekId} — Genius=${geniusWinner ?? "none"} Popular=${popularWinner ?? "none"} Collector=${collectorWinner ?? "none"} Ruler=${rulerWinner ?? "none"}`,
    );
  }
}

export async function syncAllWeeklyLeaderRoles(client: Client): Promise<void> {
  registerWeeklyLeaderSync((c, id) => syncWeeklyLeaderRoles(c, id));
  bindQueueClient(client);
  const channelId = config.geniusLeaderboardChannelId;
  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (channel && "guildId" in channel && channel.guildId) {
    await syncWeeklyLeaderRoles(client, channel.guildId, { fullSweep: true });
    return;
  }
  for (const guild of client.guilds.cache.values()) {
    await syncWeeklyLeaderRoles(client, guild.id, { fullSweep: true });
  }
}

let weekTimer: ReturnType<typeof setTimeout> | null = null;
let weekInterval: ReturnType<typeof setInterval> | null = null;
let dailyTimer: ReturnType<typeof setTimeout> | null = null;
let dailyInterval: ReturnType<typeof setInterval> | null = null;

function msUntilNextUtcMidnight(now = new Date()): number {
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );
  return Math.max(1_000, next.getTime() - now.getTime());
}

export function startWeeklyLeaderRoleSync(client: Client): void {
  stopWeeklyLeaderRoleSync();
  const run = () => {
    void (async () => {
      await syncAllWeeklyLeaderRoles(client);
      // Fresh week → delete old boards in each thread and post new ones.
      await wipeAndRepostAllWeeklyLeaderboards(client);
    })().catch((err) =>
      console.error("[weeklyRoles] Monday sync failed:", err),
    );
  };
  weekTimer = setTimeout(() => {
    run();
    weekInterval = setInterval(run, 7 * 24 * 60 * 60_000);
  }, Math.max(5_000, msUntilNextUtcWeek()));
  console.log("[weeklyRoles] Next UTC week role sync scheduled.");
}

export function stopWeeklyLeaderRoleSync(): void {
  if (weekTimer) {
    clearTimeout(weekTimer);
    weekTimer = null;
  }
  if (weekInterval) {
    clearInterval(weekInterval);
    weekInterval = null;
  }
}

export function startDailyLeaderboardRefresh(client: Client): void {
  stopDailyLeaderboardRefresh();
  const run = () => {
    void ensureWeeklyLeaderboardPosts(client).catch((err) =>
      console.error("[weeklyLb] Daily refresh failed:", err),
    );
  };
  dailyTimer = setTimeout(() => {
    run();
    dailyInterval = setInterval(run, 24 * 60 * 60_000);
  }, msUntilNextUtcMidnight());
  console.log("[weeklyLb] Daily board refresh scheduled (UTC midnight).");
}

export function stopDailyLeaderboardRefresh(): void {
  if (dailyTimer) {
    clearTimeout(dailyTimer);
    dailyTimer = null;
  }
  if (dailyInterval) {
    clearInterval(dailyInterval);
    dailyInterval = null;
  }
}

function formatScore(n: number): string {
  return n.toLocaleString("en-US");
}

async function rankEmoji(guild: Guild, rank: number): Promise<string> {
  const id = NUMBER_EMOJI_IDS[rank];
  if (!id) return `**${rank}.**`;
  return resolveEmojiById(guild, id, `num${rank}`);
}

async function buildRows(
  guild: Guild,
  client: Message["client"],
  rows: Array<{ userId: string; points: number }>,
  unit: "points" | "rep" | "hated",
): Promise<string[]> {
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rank = i + 1;
    const emoji = await rankEmoji(guild, rank);
    const mention = ltrIsolate(`<@${row.userId}>`);
    await client.users.fetch(row.userId).catch(() => null);
    const score = formatScore(row.points);
    if (unit === "points") {
      lines.push(
        ltrLine(`${emoji} ${mention} — **${score}** points ${POINTS_EMOJI}`),
      );
    } else if (unit === "hated") {
      lines.push(ltrLine(`${emoji} ${mention} — **−${score}** rep`));
    } else {
      lines.push(ltrLine(`${emoji} ${mention} — **${score}** rep`));
    }
  }
  return lines;
}

export async function buildGeniusLeaderboardEmbed(
  guildId: string,
  client: Message["client"],
): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  const guild = await client.guilds.fetch(guildId);
  await guild.emojis.fetch().catch((err) =>
    console.warn("[genius] Could not refresh guild emojis:", err),
  );
  const { genius } = await ensureWeeklyRoles(guild);
  const [rows, previousWinnerId] = await Promise.all([
    getWeeklyPointsTop(guildId, 10),
    getPreviousWeekGeniusId(guildId),
  ]);
  const reset = formatResetCountdown(msUntilNextUtcWeek());
  const info = await resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME);
  const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
  const thumb = new AttachmentBuilder(path.join(ASSETS, GENIUS_THUMB), {
    name: GENIUS_THUMB,
  });
  const winnerLine = crownedWinnerLine(
    crown,
    "Genius of the Week",
    previousWinnerId,
  );
  const rankingBlock =
    rows.length === 0
      ? "_No points earned this week yet._"
      : (await buildRows(guild, client, rows, "points")).join("\n");

  return {
    embed: new EmbedBuilder()
      .setColor(GENIUS_COLOR)
      .setAuthor({
        name: GENIUS_AUTHOR,
        iconURL: client.user?.displayAvatarURL({ size: 64 }),
      })
      .setThumbnail(`attachment://${GENIUS_THUMB}`)
      .setDescription(
        [
          winnerLine,
          "",
          "**Next Reset**",
          `🔔 ${reset}`,
          "",
          "__Rankings__",
          rankingBlock,
          "",
          `${info} The winner at the end of the week will receive the **<@&${genius.id}>** role!`,
        ].join("\n"),
      )
      .setFooter({ text: "Updates live · Resets Monday 00:00 UTC" })
      .setTimestamp(),
    files: [thumb],
  };
}

export async function buildGeniusAllTimeLeaderboardEmbed(
  guildId: string,
  client: Message["client"],
): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  const guild = await client.guilds.fetch(guildId);
  await guild.emojis.fetch().catch((err) =>
    console.warn("[genius-alltime] Could not refresh guild emojis:", err),
  );
  const rows = await getAllTimePointsTop(guildId, 10);
  const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
  const thumb = new AttachmentBuilder(path.join(ASSETS, GENIUS_THUMB), {
    name: GENIUS_THUMB,
  });

  if (rows.length === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(GENIUS_COLOR)
        .setAuthor({
          name: GENIUS_ALLTIME_AUTHOR,
          iconURL: client.user?.displayAvatarURL({ size: 64 }),
        })
        .setThumbnail(`attachment://${GENIUS_THUMB}`)
        .setDescription(
          [
            `${crown} **All-Time Genius** — _nobody yet_`,
            "",
            "__Rankings__",
            "_No points earned yet._",
          ].join("\n"),
        )
        .setFooter({ text: "Updates live · All-time points" })
        .setTimestamp(),
      files: [thumb],
    };
  }

  const leader = rows[0]!;
  const lines = await buildRows(guild, client, rows, "points");

  return {
    embed: new EmbedBuilder()
      .setColor(GENIUS_COLOR)
      .setAuthor({
        name: GENIUS_ALLTIME_AUTHOR,
        iconURL: client.user?.displayAvatarURL({ size: 64 }),
      })
      .setThumbnail(`attachment://${GENIUS_THUMB}`)
      .setDescription(
        [
          ltrLine(
            `${crown} **All-Time Genius** — ${ltrIsolate(`<@${leader.userId}>`)}`,
          ),
          "",
          "__Rankings__",
          lines.join("\n"),
        ].join("\n"),
      )
      .setFooter({ text: "Updates live · All-time points" })
      .setTimestamp(),
    files: [thumb],
  };
}

export async function buildPopularLeaderboardEmbed(
  guildId: string,
  client: Message["client"],
): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  const guild = await client.guilds.fetch(guildId);
  await guild.emojis.fetch().catch((err) =>
    console.warn("[popular] Could not refresh guild emojis:", err),
  );
  const { popular } = await ensureWeeklyRoles(guild);
  const [rows, previousWinnerId] = await Promise.all([
    getWeeklyRepTop(guildId, 10),
    getPreviousWeekPopularId(guildId),
  ]);
  const reset = formatResetCountdown(msUntilNextUtcWeek());
  const info = await resolveEmojiById(guild, INFO_EMOJI_ID, INFO_EMOJI_NAME);
  const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
  const thumb = new AttachmentBuilder(path.join(ASSETS, POPULAR_THUMB), {
    name: POPULAR_THUMB,
  });
  const winnerLine = crownedWinnerLine(
    crown,
    "Most Popular of Hesitation Weekly",
    previousWinnerId,
  );
  const rankingBlock =
    rows.length === 0
      ? "_No reputation earned this week yet._"
      : (await buildRows(guild, client, rows, "rep")).join("\n");

  return {
    embed: new EmbedBuilder()
      .setColor(POPULAR_COLOR)
      .setAuthor({
        name: POPULAR_AUTHOR,
        iconURL: client.user?.displayAvatarURL({ size: 64 }),
      })
      .setThumbnail(`attachment://${POPULAR_THUMB}`)
      .setDescription(
        [
          winnerLine,
          "",
          "**Next Reset**",
          `🔔 ${reset}`,
          "",
          "__Rankings__",
          rankingBlock,
          "",
          `${info} The winner at the end of the week will receive the **<@&${popular.id}>** role!`,
        ].join("\n"),
      )
      .setFooter({ text: "Updates live · Resets Monday 00:00 UTC" })
      .setTimestamp(),
    files: [thumb],
  };
}

export async function buildPopularAllTimeLeaderboardEmbed(
  guildId: string,
  client: Message["client"],
): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  const guild = await client.guilds.fetch(guildId);
  await guild.emojis.fetch().catch((err) =>
    console.warn("[popular-alltime] Could not refresh guild emojis:", err),
  );
  const rows = await getAllTimeRepTop(guildId, 10);
  const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
  const thumb = new AttachmentBuilder(path.join(ASSETS, POPULAR_THUMB), {
    name: POPULAR_THUMB,
  });

  if (rows.length === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(POPULAR_COLOR)
        .setAuthor({
          name: POPULAR_ALLTIME_AUTHOR,
          iconURL: client.user?.displayAvatarURL({ size: 64 }),
        })
        .setThumbnail(`attachment://${POPULAR_THUMB}`)
        .setDescription(
          [
            `${crown} **All-Time Most Popular** — _nobody yet_`,
            "",
            "__Rankings__",
            "_No reputation earned yet._",
          ].join("\n"),
        )
        .setFooter({ text: "Updates live · All-time positive rep" })
        .setTimestamp(),
      files: [thumb],
    };
  }

  const leader = rows[0]!;
  const lines = await buildRows(guild, client, rows, "rep");

  return {
    embed: new EmbedBuilder()
      .setColor(POPULAR_COLOR)
      .setAuthor({
        name: POPULAR_ALLTIME_AUTHOR,
        iconURL: client.user?.displayAvatarURL({ size: 64 }),
      })
      .setThumbnail(`attachment://${POPULAR_THUMB}`)
      .setDescription(
        [
          ltrLine(
            `${crown} **All-Time Most Popular** — ${ltrIsolate(`<@${leader.userId}>`)}`,
          ),
          "",
          "__Rankings__",
          lines.join("\n"),
        ].join("\n"),
      )
      .setFooter({ text: "Updates live · All-time positive rep" })
      .setTimestamp(),
    files: [thumb],
  };
}

export async function buildHatedAllTimeLeaderboardEmbed(
  guildId: string,
  client: Message["client"],
): Promise<{ embed: EmbedBuilder; files: AttachmentBuilder[] }> {
  const guild = await client.guilds.fetch(guildId);
  await guild.emojis.fetch().catch((err) =>
    console.warn("[hated-alltime] Could not refresh guild emojis:", err),
  );
  const rows = await getAllTimeHatedTop(guildId, 10);
  const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
  const thumb = new AttachmentBuilder(path.join(ASSETS, POPULAR_THUMB), {
    name: POPULAR_THUMB,
  });

  if (rows.length === 0) {
    return {
      embed: new EmbedBuilder()
        .setColor(HATED_COLOR)
        .setAuthor({
          name: HATED_ALLTIME_AUTHOR,
          iconURL: client.user?.displayAvatarURL({ size: 64 }),
        })
        .setThumbnail(`attachment://${POPULAR_THUMB}`)
        .setDescription(
          [
            `${crown} **All-Time Most Hated** — _nobody yet_`,
            "",
            "__Rankings__",
            "_No negative reputation earned yet._",
          ].join("\n"),
        )
        .setFooter({ text: "Updates live · All-time negative rep" })
        .setTimestamp(),
      files: [thumb],
    };
  }

  const leader = rows[0]!;
  const lines = await buildRows(guild, client, rows, "hated");

  return {
    embed: new EmbedBuilder()
      .setColor(HATED_COLOR)
      .setAuthor({
        name: HATED_ALLTIME_AUTHOR,
        iconURL: client.user?.displayAvatarURL({ size: 64 }),
      })
      .setThumbnail(`attachment://${POPULAR_THUMB}`)
      .setDescription(
        [
          ltrLine(
            `${crown} **All-Time Most Hated** — ${ltrIsolate(`<@${leader.userId}>`)}`,
          ),
          "",
          "__Rankings__",
          lines.join("\n"),
        ].join("\n"),
      )
      .setFooter({ text: "Updates live · All-time negative rep" })
      .setTimestamp(),
    files: [thumb],
  };
}

function isTextGuildChannel(
  channel: unknown,
): channel is TextChannel & { guild: Guild } {
  return (
    !!channel &&
    typeof channel === "object" &&
    "isTextBased" in channel &&
    typeof (channel as TextChannel).isTextBased === "function" &&
    (channel as TextChannel).isTextBased() &&
    "guild" in channel &&
    !!(channel as { guild?: Guild }).guild &&
    "messages" in channel
  );
}

/** Unarchive threads + stretch auto-hide so board edits don't fail. */
async function prepareBoardChannel(
  channel: TextChannel & { guild: Guild },
): Promise<void> {
  if (!("isThread" in channel) || typeof channel.isThread !== "function") {
    return;
  }
  if (!channel.isThread()) return;
  const thread = channel as ThreadChannel;

  try {
    if (thread.archived) {
      await thread.setArchived(false, "Weekly leaderboard refresh");
      console.log(`[weeklyLb] Unarchived board thread ${thread.id}`);
    }
    // Longest Discord allows (1 week). Keeps inactivity hide from firing sooner.
    if (thread.autoArchiveDuration !== 10_080) {
      await thread.setAutoArchiveDuration(10_080, "Keep weekly boards visible longer");
    }
    if (thread.locked) {
      await thread.setLocked(false, "Weekly leaderboard refresh");
    }
  } catch (err) {
    console.warn(`[weeklyLb] Failed to prepare thread ${thread.id}:`, err);
  }
}

function cacheKeyForKind(kind: BoardPostKind): {
  get: () => string | null;
  set: (id: string) => void;
} {
  switch (kind) {
    case "genius":
      return {
        get: () => cachedGeniusMessageId,
        set: (id) => {
          cachedGeniusMessageId = id;
        },
      };
    case "genius-alltime":
      return {
        get: () => cachedGeniusAllTimeMessageId,
        set: (id) => {
          cachedGeniusAllTimeMessageId = id;
        },
      };
    case "popular":
      return {
        get: () => cachedPopularMessageId,
        set: (id) => {
          cachedPopularMessageId = id;
        },
      };
    case "popular-alltime":
      return {
        get: () => cachedPopularAllTimeMessageId,
        set: (id) => {
          cachedPopularAllTimeMessageId = id;
        },
      };
    case "hated-alltime":
      return {
        get: () => cachedHatedAllTimeMessageId,
        set: (id) => {
          cachedHatedAllTimeMessageId = id;
        },
      };
  }
}

async function findBoardMessage(
  channel: TextChannel & { guild: Guild },
  authorName: string,
  kind: BoardPostKind,
): Promise<Message | null> {
  const cache = cacheKeyForKind(kind);
  let preferId = cache.get();
  if (!preferId) {
    preferId = await getBoardPostMessageId(channel.guild.id, kind);
    if (preferId) cache.set(preferId);
  }

  if (preferId) {
    const existing = await channel.messages.fetch(preferId).catch(() => null);
    if (
      existing &&
      existing.author.id === channel.client.user?.id &&
      existing.embeds.some((e) => e.author?.name === authorName)
    ) {
      return existing;
    }
  }

  // Scan up to 100 recent messages (threads can fill up with chat).
  const fetched = await channel.messages.fetch({ limit: 100 }).catch((err) => {
    console.warn("[weeklyLb] Failed to scan channel history:", err);
    return null;
  });
  if (!fetched) return null;

  const matches = [...fetched.values()]
    .filter(
      (m) =>
        m.author.id === channel.client.user?.id &&
        m.embeds.some((e) => e.author?.name === authorName),
    )
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Keep the oldest (original post); delete accidental duplicates.
  const keep = matches[0] ?? null;
  for (const dup of matches.slice(1)) {
    await dup.delete().catch(() => null);
  }
  return keep;
}

async function upsertBoardMessage(
  channel: TextChannel & { guild: Guild },
  kind: BoardPostKind,
): Promise<void> {
  await prepareBoardChannel(channel);

  const authorName =
    kind === "genius"
      ? GENIUS_AUTHOR
      : kind === "genius-alltime"
        ? GENIUS_ALLTIME_AUTHOR
        : kind === "popular"
          ? POPULAR_AUTHOR
          : kind === "popular-alltime"
            ? POPULAR_ALLTIME_AUTHOR
            : HATED_ALLTIME_AUTHOR;

  const { embed, files } =
    kind === "genius"
      ? await buildGeniusLeaderboardEmbed(channel.guild.id, channel.client)
      : kind === "genius-alltime"
        ? await buildGeniusAllTimeLeaderboardEmbed(
            channel.guild.id,
            channel.client,
          )
        : kind === "popular"
          ? await buildPopularLeaderboardEmbed(
              channel.guild.id,
              channel.client,
            )
          : kind === "popular-alltime"
            ? await buildPopularAllTimeLeaderboardEmbed(
                channel.guild.id,
                channel.client,
              )
            : await buildHatedAllTimeLeaderboardEmbed(
                channel.guild.id,
                channel.client,
              );

  const cache = cacheKeyForKind(kind);

  try {
    const existing = await findBoardMessage(channel, authorName, kind);
    if (existing) {
      await existing.edit(
        files.length > 0 ? { embeds: [embed], files } : { embeds: [embed] },
      );
      cache.set(existing.id);
      await saveBoardPostMessageId(
        channel.guild.id,
        kind,
        channel.id,
        existing.id,
      );
      return;
    }

    const sent = await channel.send(
      files.length > 0 ? { embeds: [embed], files } : { embeds: [embed] },
    );
    cache.set(sent.id);
    await saveBoardPostMessageId(channel.guild.id, kind, channel.id, sent.id);
    console.log(`[weeklyLb] Posted ${kind} board in #${channel.id} (${sent.id})`);
  } catch (err) {
    console.warn(`[weeklyLb] upsert ${kind} failed in #${channel.id}:`, err);
  }
}

/**
 * Delete existing Popular / Most Hated board messages in the channel,
 * then post fresh ones: all-time popular → most hated → weekly popular.
 */
export async function wipeAndRepostPopularLeaderboards(
  client: Client,
): Promise<void> {
  registerWeeklyBoardRefresh((c, k) => ensureWeeklyLeaderboardPosts(c, k));
  bindQueueClient(client);

  const channel = await client.channels
    .fetch(config.popularLeaderboardChannelId)
    .catch((err) => {
      console.warn(
        `[weeklyLb] Could not fetch popular channel ${config.popularLeaderboardChannelId}:`,
        err,
      );
      return null;
    });

  if (!isTextGuildChannel(channel)) {
    console.warn(
      `[weeklyLb] Popular channel ${config.popularLeaderboardChannelId} missing or not text.`,
    );
    return;
  }

  await ensureWeeklyRoles(channel.guild);
  await deleteBoardMessagesMatching(channel, (name) =>
    /popular/i.test(name) ||
    /hated/i.test(name) ||
    /reputation leaderboard/i.test(name),
  );

  cachedPopularMessageId = null;
  cachedPopularAllTimeMessageId = null;
  cachedHatedAllTimeMessageId = null;

  await upsertBoardMessage(channel, "popular-alltime");
  await upsertBoardMessage(channel, "hated-alltime");
  await upsertBoardMessage(channel, "popular");
  console.log(
    `[weeklyLb] Reposted popular boards in #${channel.id} (all-time → hated → weekly).`,
  );
}

/**
 * Delete Genius boards in the channel, then post all-time → weekly.
 */
export async function wipeAndRepostGeniusLeaderboards(
  client: Client,
): Promise<void> {
  registerWeeklyBoardRefresh((c, k) => ensureWeeklyLeaderboardPosts(c, k));
  bindQueueClient(client);

  const channel = await client.channels
    .fetch(config.geniusLeaderboardChannelId)
    .catch((err) => {
      console.warn(
        `[weeklyLb] Could not fetch genius channel ${config.geniusLeaderboardChannelId}:`,
        err,
      );
      return null;
    });

  if (!isTextGuildChannel(channel)) {
    console.warn(
      `[weeklyLb] Genius channel ${config.geniusLeaderboardChannelId} missing or not text.`,
    );
    return;
  }

  await ensureWeeklyRoles(channel.guild);
  await deleteBoardMessagesMatching(channel, (name) =>
    name === GENIUS_AUTHOR ||
    name === GENIUS_ALLTIME_AUTHOR ||
    /game leaderboard/i.test(name),
  );

  cachedGeniusMessageId = null;
  cachedGeniusAllTimeMessageId = null;

  await upsertBoardMessage(channel, "genius-alltime");
  await upsertBoardMessage(channel, "genius");
  console.log(
    `[weeklyLb] Reposted genius boards in #${channel.id} (all-time → weekly).`,
  );
}

/** Monday UTC week rollover: wipe + repost Genius and Popular boards. */
export async function wipeAndRepostAllWeeklyLeaderboards(
  client: Client,
): Promise<void> {
  await wipeAndRepostGeniusLeaderboards(client);
  await wipeAndRepostPopularLeaderboards(client);
}

async function deleteBoardMessagesMatching(
  channel: TextChannel & { guild: Guild },
  matchAuthor: (name: string) => boolean,
): Promise<void> {
  const botId = channel.client.user?.id;
  const fetched = await channel.messages.fetch({ limit: 50 }).catch((err) => {
    console.warn("[weeklyLb] Failed to fetch board channel history:", err);
    return null;
  });
  if (!fetched || !botId) return;

  const toDelete = [...fetched.values()].filter((m) => {
    if (m.author.id !== botId) return false;
    return m.embeds.some((e) => matchAuthor(e.author?.name ?? ""));
  });
  for (const msg of toDelete) {
    await msg.delete().catch(() => null);
  }
  if (toDelete.length > 0) {
    console.log(
      `[weeklyLb] Deleted ${toDelete.length} old board message(s) in #${channel.id}.`,
    );
  }
}

/**
 * Ensure Genius and/or Popular embeds exist in their configured channels.
 * Edits existing bot messages when found; only sends new ones if missing/deleted.
 * Collector rankings live in `!inv` → Rankings (not a channel board).
 */
export async function ensureWeeklyLeaderboardPosts(
  client: Client,
  kind: "genius" | "popular" | "both" = "both",
): Promise<void> {
  registerWeeklyBoardRefresh((c, k) => ensureWeeklyLeaderboardPosts(c, k));
  bindQueueClient(client);

  const boards: Array<{ kind: "genius" | "popular"; channelId: string }> = [];
  if (kind === "genius" || kind === "both") {
    boards.push({
      kind: "genius",
      channelId: config.geniusLeaderboardChannelId,
    });
  }
  if (kind === "popular" || kind === "both") {
    boards.push({
      kind: "popular",
      channelId: config.popularLeaderboardChannelId,
    });
  }

  for (const board of boards) {
    const channel = await client.channels
      .fetch(board.channelId)
      .catch((err) => {
        console.warn(
          `[weeklyLb] Could not fetch channel ${board.channelId}:`,
          err,
        );
        return null;
      });

    if (!isTextGuildChannel(channel)) {
      console.warn(
        `[weeklyLb] Channel ${board.channelId} is missing or not a guild text channel.`,
      );
      continue;
    }

    await ensureWeeklyRoles(channel.guild);
    // All-time first, weekly second (Discord shows newest below).
    if (board.kind === "genius") {
      await upsertBoardMessage(channel, "genius-alltime");
      await upsertBoardMessage(channel, "genius");
    } else {
      await upsertBoardMessage(channel, "popular-alltime");
      await upsertBoardMessage(channel, "hated-alltime");
      await upsertBoardMessage(channel, "popular");
    }
    console.log(
      `[weeklyLb] ${board.kind} board synced in #${board.channelId} (week ${utcWeekId()}).`,
    );
  }
}
