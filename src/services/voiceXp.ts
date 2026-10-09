import type { Client, VoiceState } from "discord.js";
import { config } from "../config.js";
import { addXp } from "./xp.js";

type SessionKey = string; // guildId:userId

interface VoiceSession {
  guildId: string;
  userId: string;
  channelId: string;
  /** Accumulated ms since last XP grant while eligible */
  accruedMs: number;
}

const sessions = new Map<SessionKey, VoiceSession>();
let ticker: ReturnType<typeof setInterval> | null = null;
let clientRef: Client | null = null;

function key(guildId: string, userId: string): SessionKey {
  return `${guildId}:${userId}`;
}

function isEligible(state: VoiceState): boolean {
  if (!state.channelId || !state.guild) return false;
  if (state.member?.user.bot) return false;
  if (state.selfMute || state.serverMute) return false;
  if (state.selfDeaf || state.serverDeaf) return false;
  const afkId = state.guild.afkChannelId;
  if (afkId && state.channelId === afkId) return false;
  return true;
}

export function syncVoiceState(oldState: VoiceState, newState: VoiceState): void {
  const guildId = newState.guild.id;
  const userId = newState.id;
  const k = key(guildId, userId);

  if (isEligible(newState) && newState.channelId) {
    const existing = sessions.get(k);
    if (existing && existing.channelId === newState.channelId) return;
    sessions.set(k, {
      guildId,
      userId,
      channelId: newState.channelId,
      accruedMs: existing?.accruedMs ?? 0,
    });
    return;
  }

  sessions.delete(k);
  void oldState;
}

async function tick(): Promise<void> {
  if (!clientRef) return;
  const step = config.voiceTickMs;

  for (const [k, session] of sessions) {
    try {
      session.accruedMs += step;
      if (session.accruedMs < config.voiceTickMs) continue;

      const minutes = Math.floor(session.accruedMs / config.voiceTickMs);
      session.accruedMs -= minutes * config.voiceTickMs;

      const amount = minutes * config.voiceXpPerMinute;
      const guild = clientRef.guilds.cache.get(session.guildId);
      const member = await guild?.members
        .fetch(session.userId)
        .catch(() => null);

      // Re-validate the member is still in VC and eligible
      const vs = member?.voice;
      if (!vs || !isEligible(vs)) {
        sessions.delete(k);
        continue;
      }

      await addXp(clientRef, session.guildId, session.userId, amount, member);
    } catch (err) {
      // Keep granting XP to other sessions even if one fails.
      console.error(`[voiceXp] Failed to grant XP for session ${k}:`, err);
    }
  }
}

export function startVoiceXpTicker(client: Client): void {
  clientRef = client;
  if (ticker) clearInterval(ticker);
  ticker = setInterval(() => {
    void tick().catch((err) => console.error("[voiceXp] tick error", err));
  }, config.voiceTickMs);
}

export function stopVoiceXpTicker(): void {
  if (ticker) clearInterval(ticker);
  ticker = null;
  sessions.clear();
  clientRef = null;
}

/** Seed sessions from current voice states after ready (bot restart recovery). */
export function seedVoiceSessions(client: Client): void {
  for (const guild of client.guilds.cache.values()) {
    for (const [, state] of guild.voiceStates.cache) {
      if (isEligible(state) && state.channelId) {
        sessions.set(key(guild.id, state.id), {
          guildId: guild.id,
          userId: state.id,
          channelId: state.channelId,
          accruedMs: 0,
        });
      }
    }
  }
}
