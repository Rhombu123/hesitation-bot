import {
  EmbedBuilder,
  PermissionFlagsBits,
  type Guild,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { EMBED_COLOR, config } from "../config.js";
import { isAppealsGuild } from "../utils/appealsGuild.js";

type JoinRecord = { userId: string; at: number };

type GuildRaidState = {
  joins: JoinRecord[];
  /** Manual or auto lockdown until this timestamp (0 = off). */
  lockdownUntil: number;
  /** Prevent alert spam. */
  lastAlertAt: number;
};

const stateByGuild = new Map<string, GuildRaidState>();

function getState(guildId: string): GuildRaidState {
  let state = stateByGuild.get(guildId);
  if (!state) {
    state = { joins: [], lockdownUntil: 0, lastAlertAt: 0 };
    stateByGuild.set(guildId, state);
  }
  return state;
}

function pruneJoins(state: GuildRaidState, now: number): void {
  const cutoff = now - config.antiRaidWindowMs;
  state.joins = state.joins.filter((j) => j.at >= cutoff);
}

export function isRaidLockdownActive(guildId: string, now = Date.now()): boolean {
  const state = getState(guildId);
  if (state.lockdownUntil > now) return true;
  if (state.lockdownUntil > 0 && state.lockdownUntil <= now) {
    state.lockdownUntil = 0;
  }
  return false;
}

export function getRaidStatus(guildId: string): {
  lockdown: boolean;
  lockdownUntil: number;
  recentJoins: number;
} {
  const now = Date.now();
  const state = getState(guildId);
  pruneJoins(state, now);
  return {
    lockdown: isRaidLockdownActive(guildId, now),
    lockdownUntil: state.lockdownUntil,
    recentJoins: state.joins.length,
  };
}

export function enableRaidLockdown(
  guildId: string,
  durationMs = config.antiRaidLockdownMs,
): number {
  const until = Date.now() + durationMs;
  const state = getState(guildId);
  state.lockdownUntil = Math.max(state.lockdownUntil, until);
  return state.lockdownUntil;
}

export function disableRaidLockdown(guildId: string): void {
  getState(guildId).lockdownUntil = 0;
}

function accountAgeDays(member: GuildMember): number {
  const created = member.user.createdTimestamp;
  return (Date.now() - created) / (24 * 60 * 60_000);
}

async function alertStaff(
  guild: Guild,
  embed: EmbedBuilder,
): Promise<void> {
  const channelId =
    config.antiRaidAlertChannelId || config.bumpDetectChannelId;
  if (!channelId) return;

  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.isDMBased()) return;

  await (channel as TextChannel)
    .send({ embeds: [embed] })
    .catch((err) => console.warn("[antiRaid] Alert failed:", err));
}

async function actionMember(
  member: GuildMember,
  reason: string,
): Promise<"timeout" | "kick" | "skipped" | "failed"> {
  if (member.user.bot) return "skipped";
  if (member.id === member.guild.ownerId) return "skipped";
  if (member.permissions.has(PermissionFlagsBits.Administrator)) {
    return "skipped";
  }

  const me = member.guild.members.me;
  if (!me) return "failed";
  if (member.roles.highest.position >= me.roles.highest.position) {
    return "failed";
  }

  try {
    if (config.antiRaidAction === "kick") {
      if (!me.permissions.has(PermissionFlagsBits.KickMembers)) return "failed";
      await member.kick(reason);
      return "kick";
    }
    if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return "failed";
    }
    await member.timeout(config.antiRaidTimeoutMs, reason);
    return "timeout";
  } catch (err) {
    console.warn(`[antiRaid] Action failed for ${member.id}:`, err);
    return "failed";
  }
}

/**
 * Track a join. Returns true if this member was actioned (raid defense).
 */
export async function onMemberJoinAntiRaid(
  member: GuildMember,
): Promise<boolean> {
  if (!config.antiRaidEnabled) return false;
  if (member.user.bot) return false;
  if (isAppealsGuild(member.guild.id)) return false;

  const now = Date.now();
  const state = getState(member.guild.id);
  pruneJoins(state, now);
  state.joins.push({ userId: member.id, at: now });

  const inLockdown = isRaidLockdownActive(member.guild.id, now);
  const burst = state.joins.length >= config.antiRaidJoinThreshold;
  const young =
    config.antiRaidMinAccountAgeDays > 0 &&
    accountAgeDays(member) < config.antiRaidMinAccountAgeDays;

  // Auto-trigger lockdown on join burst.
  if (burst && !inLockdown) {
    enableRaidLockdown(member.guild.id);
    console.log(
      `[antiRaid] Lockdown armed in ${member.guild.id} — ${state.joins.length} joins / ${config.antiRaidWindowMs}ms`,
    );

    if (now - state.lastAlertAt > 30_000) {
      state.lastAlertAt = now;
      const embed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setAuthor({ name: "Anti-Raid" })
        .setDescription(
          [
            `🚨 **Join surge detected** in **${member.guild.name}**`,
            `• **${state.joins.length}** joins in the last **${Math.round(config.antiRaidWindowMs / 1000)}s**`,
            `• Lockdown active for **${Math.round(config.antiRaidLockdownMs / 60_000)}m**`,
            `• Action: **${config.antiRaidAction}** on new joins`,
            "",
            "Staff: `!unlock` to end early · `!lockdown` to extend",
          ].join("\n"),
        )
        .setTimestamp(new Date());
      await alertStaff(member.guild, embed);
    }

    // Action everyone in the current burst window (best-effort).
    for (const join of state.joins) {
      if (join.userId === member.id) continue;
      const other = await member.guild.members
        .fetch(join.userId)
        .catch(() => null);
      if (!other) continue;
      await actionMember(other, "Anti-raid: join surge");
    }
  }

  if (!isRaidLockdownActive(member.guild.id)) return false;

  const result = await actionMember(
    member,
    young
      ? `Anti-raid: new account (<${config.antiRaidMinAccountAgeDays}d)`
      : "Anti-raid: lockdown",
  );

  return result === "timeout" || result === "kick";
}
