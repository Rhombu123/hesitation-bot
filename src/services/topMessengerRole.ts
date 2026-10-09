import type { Client } from "discord.js";
import { config } from "../config.js";
import { getChannelDailyTop } from "./channelDailyMessages.js";
import { sendChatStarAwardDm } from "./chatStarAwardDm.js";
import { previousDailyDateString, msUntilNextDailyReset } from "../utils/helpers.js";

export type LoungeKey = "1" | "2";

type LoungeDef = {
  key: LoungeKey;
  label: string;
  channelId: string;
  roleId: string;
};

export function getLounges(): LoungeDef[] {
  return [
    {
      key: "1",
      label: "Lounge 1",
      channelId: config.lounge1ChannelId,
      roleId: config.topMessengerRoleId,
    },
    {
      key: "2",
      label: "Lounge 2",
      channelId: config.lounge2ChannelId,
      roleId: config.lounge2ChatStarRoleId,
    },
  ];
}

export function getLounge(key: LoungeKey): LoungeDef {
  const found = getLounges().find((l) => l.key === key);
  if (!found) throw new Error(`Unknown lounge ${key}`);
  return found;
}

/**
 * Who holds each lounge Chat Star for which completed UTC day.
 * Awarded from that lounge's yesterday `!ltop N` #1 — no mid-day transfers.
 */
const holderByKey = new Map<
  string,
  { userId: string | null; awardedForDate: string }
>();

function cacheKey(guildId: string, lounge: LoungeKey): string {
  return `${guildId}:${lounge}`;
}

async function syncOneLoungeChatStar(
  client: Client,
  guildId: string,
  lounge: LoungeDef,
  opts: { fullSweep?: boolean } = {},
): Promise<void> {
  const id = lounge.roleId;
  if (!id) return;

  const awardedForDate = previousDailyDateString();
  const top = await getChannelDailyTop(
    guildId,
    lounge.channelId,
    1,
    awardedForDate,
  );
  const winnerId = top[0]?.userId ?? null;
  const ck = cacheKey(guildId, lounge.key);

  const cached = holderByKey.get(ck);
  if (
    !opts.fullSweep &&
    cached &&
    cached.awardedForDate === awardedForDate &&
    cached.userId === winnerId
  ) {
    return;
  }

  try {
    const guild = await client.guilds.fetch(guildId);
    const me = guild.members.me;
    if (!me?.permissions.has("ManageRoles")) {
      console.warn(
        `[topMessenger] Bot is missing Manage Roles — cannot move ${lounge.label} Chat Star.`,
      );
      return;
    }

    const role = await guild.roles.fetch(id).catch(() => null);
    if (!role) {
      console.warn(
        `[topMessenger] ${lounge.label} Chat Star role ${id} not found.`,
      );
      return;
    }

    if (role.managed || role.position >= me.roles.highest.position) {
      console.warn(
        `[topMessenger] Cannot assign ${role.name} — move the bot's role above it.`,
      );
      return;
    }

    const dayChanged = !cached || cached.awardedForDate !== awardedForDate;
    const winnerChanged = cached?.userId !== winnerId;
    const allowManual = config.chatStarAllowManual;

    if (!allowManual) {
      if (opts.fullSweep || dayChanged) {
        await guild.members.fetch().catch(() => null);
        const holders = guild.members.cache.filter((m) => m.roles.cache.has(id));
        for (const [, member] of holders) {
          if (winnerId && member.id === winnerId) continue;
          await member.roles
            .remove(role, `${lounge.label} Chat Star — new UTC day award`)
            .catch((err) =>
              console.warn(
                `[topMessenger] Failed removing role from ${member.user.tag}:`,
                err,
              ),
            );
        }
      } else if (winnerChanged) {
        if (cached?.userId) {
          const previous = await guild.members
            .fetch(cached.userId)
            .catch(() => null);
          if (previous?.roles.cache.has(id)) {
            await previous.roles
              .remove(
                role,
                `${lounge.label} Chat Star → yesterday's !ltop ${lounge.key} #1`,
              )
              .catch((err) =>
                console.warn(
                  `[topMessenger] Failed removing role from ${previous.user.tag}:`,
                  err,
                ),
              );
          }
        }
        for (const [, member] of role.members) {
          if (winnerId && member.id === winnerId) continue;
          await member.roles
            .remove(role, `${lounge.label} Chat Star — not yesterday's #1`)
            .catch((err) =>
              console.warn(
                `[topMessenger] Failed removing role from ${member.user.tag}:`,
                err,
              ),
            );
        }
      }
    }

    if (winnerId) {
      const winner = await guild.members.fetch(winnerId).catch(() => null);
      if (!winner) {
        console.warn(
          `[topMessenger] Could not fetch ${lounge.label} winner ${winnerId}`,
        );
      } else if (!winner.roles.cache.has(id)) {
        await winner.roles.add(
          role,
          `${lounge.label} Chat Star for ${awardedForDate} (!ltop ${lounge.key} #1)`,
        );
        console.log(
          `[topMessenger] Gave ${winner.user.tag} ${lounge.label} Chat Star (for ${awardedForDate}).`,
        );
        void sendChatStarAwardDm(winner, lounge.label);
      }
    }

    holderByKey.set(ck, { userId: winnerId, awardedForDate });
  } catch (err) {
    console.error(
      `[topMessenger] Sync failed for ${lounge.label} in ${guildId}:`,
      err,
    );
  }
}

/** Sync both lounge Chat Stars for a guild. */
export async function syncTopMessengerRole(
  client: Client,
  guildId: string,
  opts: { fullSweep?: boolean } = {},
): Promise<void> {
  for (const lounge of getLounges()) {
    await syncOneLoungeChatStar(client, guildId, lounge, opts);
  }
}

export function invalidateTopMessengerCache(guildId?: string): void {
  if (!guildId) {
    holderByKey.clear();
    return;
  }
  for (const key of [...holderByKey.keys()]) {
    if (key.startsWith(`${guildId}:`)) holderByKey.delete(key);
  }
}

let midnightTimer: ReturnType<typeof setTimeout> | null = null;

export function startTopMessengerMidnightSync(client: Client): void {
  stopTopMessengerMidnightSync();

  const scheduleNext = () => {
    midnightTimer = setTimeout(() => {
      invalidateTopMessengerCache();
      for (const guild of client.guilds.cache.values()) {
        void syncTopMessengerRole(client, guild.id, { fullSweep: true });
      }
      scheduleNext();
    }, msUntilNextDailyReset());
  };

  scheduleNext();
  console.log(
    "[topMessenger] Local-midnight Lounge 1+2 Chat Star awards scheduled.",
  );
}

export function stopTopMessengerMidnightSync(): void {
  if (midnightTimer) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
}

export async function syncAllTopMessengerRoles(client: Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    await syncTopMessengerRole(client, guild.id, { fullSweep: true });
  }
}
