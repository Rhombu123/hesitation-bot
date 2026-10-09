import type { Message, TextChannel } from "discord.js";
import { config } from "../config.js";
import { randomInt } from "../utils/helpers.js";
import { getActiveColorRound, startColorRound } from "./colorGame.js";
import { getActiveCrateRound, startCrateRound } from "./crateGame.js";
import { getActiveDiceRound, startDiceRound } from "./diceGame.js";
import {
  getActiveEmojiEqRound,
  startEmojiEqRound,
} from "./emojiEqGame.js";
import {
  getActiveEmojiRaceRound,
  startEmojiRaceRound,
} from "./emojiRaceGame.js";
import { getActiveFlagRound, startFlagRound } from "./flagGame.js";
import {
  getActiveKnowledgeRound,
  startKnowledgeRound,
} from "./knowledgeGame.js";
import { getActiveLangRound, startLangRound } from "./langGame.js";
import { getActiveLightRound, startLightRound } from "./lightGame.js";
import { getActiveReactRound, startReactRound } from "./reactGame.js";
import { getActiveStateRound, startStateRound } from "./stateGame.js";
import { getActiveVoteRound, startVoteRound } from "./voteGame.js";
import {
  getActiveWordReverseRound,
  startWordReverseRound,
} from "./wordReverseGame.js";
import {
  getActiveNicknameRound,
  startNicknameRound,
} from "./nicknameGame.js";

export type GameKind =
  | "flag"
  | "lang"
  | "color"
  | "light"
  | "vote"
  | "dice"
  | "crate"
  | "emoji-eq"
  | "word-rev"
  | "state"
  | "emoji-race"
  | "react"
  | "knowledge"
  | "nickname";

export type GameSpawnOption = {
  kind: GameKind;
  label: string;
  emoji: string;
  description: string;
};

/** Menu entries for `!games` / `!game` (Supreme spawn picker). */
export const GAME_SPAWN_OPTIONS: readonly GameSpawnOption[] = [
  { kind: "flag", label: "Flag", emoji: "🗺️", description: "Guess the country" },
  { kind: "lang", label: "Language", emoji: "📖", description: "Guess the greeting" },
  { kind: "color", label: "Color Hunt", emoji: "🎡", description: "Pick the right color" },
  {
    kind: "light",
    label: "Red Light Green Light",
    emoji: "🚦",
    description: "Stop and go reaction game",
  },
  { kind: "dice", label: "Dice Roll Duel", emoji: "🎲", description: "Roll the highest" },
  { kind: "crate", label: "Mystery Crate", emoji: "📦", description: "Open the crate" },
  {
    kind: "emoji-eq",
    label: "Emoji Equation",
    emoji: "🪗",
    description: "Solve the emoji math (!eq)",
  },
  {
    kind: "word-rev",
    label: "Word Reverse",
    emoji: "✏️",
    description: "Type the word backwards (!back)",
  },
  {
    kind: "state",
    label: "Statement",
    emoji: "📝",
    description: "Type the statement exactly (!state)",
  },
  {
    kind: "emoji-race",
    label: "Emoji Race",
    emoji: "🥵",
    description: "First to send the emoji (!emoji)",
  },
  { kind: "react", label: "Reaction", emoji: "😊", description: "First to react wins" },
  { kind: "knowledge", label: "Trivia", emoji: "🔍", description: "General knowledge quiz" },
  {
    kind: "nickname",
    label: "Nickname",
    emoji: "🏷️",
    description: "First to change your nick wins",
  },
] as const;

const GAMES: ReadonlyArray<GameKind> = [
  "flag",
  "lang",
  "color",
  "light",
  "vote",
  "dice",
  "crate",
  "emoji-eq",
  "word-rev",
  "state",
  "emoji-race",
  "react",
  "knowledge",
  "nickname",
];

/** channelId → recent chatter timestamps */
const recentChatters = new Map<string, Map<string, number>>();

/** channelId → last auto-spawn time (any game) */
const lastAutoSpawn = new Map<string, number>();

function pruneChatters(channelId: string, now: number): Map<string, number> {
  let map = recentChatters.get(channelId);
  if (!map) {
    map = new Map();
    recentChatters.set(channelId, map);
  }
  for (const [uid, ts] of map) {
    if (now - ts > config.flagGameActivityWindowMs) map.delete(uid);
  }
  return map;
}

/** Active chatter IDs for this channel, most recent first (max 5). */
export function getRecentChatterIds(channelId: string, limit = 5): string[] {
  const map = pruneChatters(channelId, Date.now());
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}

/** True when any mini-game round is running in this channel. */
export function isChannelGameActive(channelId: string): boolean {
  return (
    !!getActiveFlagRound(channelId) ||
    !!getActiveLangRound(channelId) ||
    !!getActiveColorRound(channelId) ||
    !!getActiveLightRound(channelId) ||
    !!getActiveVoteRound(channelId) ||
    !!getActiveDiceRound(channelId) ||
    !!getActiveCrateRound(channelId) ||
    !!getActiveEmojiEqRound(channelId) ||
    !!getActiveWordReverseRound(channelId) ||
    !!getActiveStateRound(channelId) ||
    !!getActiveEmojiRaceRound(channelId) ||
    !!getActiveReactRound(channelId) ||
    !!getActiveKnowledgeRound(channelId) ||
    !!getActiveNicknameRound(channelId)
  );
}

function channelBusy(channelId: string): boolean {
  return isChannelGameActive(channelId);
}

function pickRandomGame(): GameKind {
  return GAMES[randomInt(0, GAMES.length - 1)]!;
}

export async function spawnGameByKind(
  kind: GameKind,
  channel: TextChannel,
  chatterIds: string[],
): Promise<boolean> {
  return startGame(kind, channel, chatterIds);
}

async function startGame(
  kind: GameKind,
  channel: TextChannel,
  chatterIds: string[],
): Promise<boolean> {
  switch (kind) {
    case "flag":
      return startFlagRound(channel);
    case "lang":
      return startLangRound(channel);
    case "color":
      return startColorRound(channel);
    case "light":
      return startLightRound(channel);
    case "vote":
      if (chatterIds.length < 3) return false;
      return startVoteRound(channel, chatterIds.slice(0, 5));
    case "dice":
      return startDiceRound(channel);
    case "crate":
      return startCrateRound(channel);
    case "emoji-eq":
      return startEmojiEqRound(channel);
    case "word-rev":
      return startWordReverseRound(channel);
    case "state":
      return startStateRound(channel);
    case "emoji-race":
      return startEmojiRaceRound(channel);
    case "react":
      return startReactRound(channel);
    case "knowledge":
      return startKnowledgeRound(channel);
    case "nickname":
      return startNicknameRound(channel);
  }
}

/**
 * Track chat activity and maybe auto-spawn a random mini-game.
 * Shared cooldown: at most one game per channel every ~10 minutes when
 * enough unique chatters are active.
 */
export async function noteChatActivity(message: Message<true>): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) return;
  if (!("send" in message.channel)) return;

  const channelId = message.channel.id;
  const now = Date.now();
  const map = pruneChatters(channelId, now);
  map.set(message.author.id, now);

  // Auto-spawn stays in the primary games lounge. Manual spawn can be anywhere.
  if (message.channelId !== config.gamesChannelId) return;

  if (channelBusy(channelId)) return;
  if (map.size < config.flagGameMinChatters) return;

  const last = lastAutoSpawn.get(channelId) ?? 0;
  if (now - last < config.flagGameAutoCooldownMs) return;

  lastAutoSpawn.set(channelId, now);

  const chatterIds = getRecentChatterIds(channelId, 5);
  const preferred = pickRandomGame();
  const order = [...GAMES].sort(() => Math.random() - 0.5);
  const tryOrder = [preferred, ...order.filter((g) => g !== preferred)];

  try {
    let started = false;
    for (const kind of tryOrder) {
      if (channelBusy(channelId)) break;
      started = await startGame(
        kind,
        message.channel as TextChannel,
        chatterIds,
      );
      if (started) {
        console.log(`[gameAutoSpawn] Spawned ${kind} in ${channelId}`);
        break;
      }
    }
    if (!started) lastAutoSpawn.set(channelId, last);
  } catch (err) {
    console.error("[gameAutoSpawn] Auto-spawn failed:", err);
    lastAutoSpawn.set(channelId, last);
  }
}
