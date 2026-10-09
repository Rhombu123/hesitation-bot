import {
  AttachmentBuilder,
  EmbedBuilder,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import { config, GAME_EMBED_COLOR } from "../config.js";
import {
  fetchFlagPng,
  matchesCountry,
  pickRandomCountry,
  type Country,
} from "../data/countries.js";
import { buildGameWinPayload } from "./gameWin.js";

const FLAG_FILE = "flag.png";
const FLAG_FETCH_ATTEMPTS = 6;

const FLAG_START_COLOR = GAME_EMBED_COLOR;

type ActiveRound = {
  channelId: string;
  guildId: string;
  country: Country;
  messageId: string;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
};

/** channelId → active round */
const rounds = new Map<string, ActiveRound>();
/** Channels currently fetching a flag (prevents double-start). */
const starting = new Set<string>();

export function getActiveFlagRound(channelId: string): ActiveRound | undefined {
  return rounds.get(channelId);
}

function clearRound(channelId: string): void {
  const round = rounds.get(channelId);
  if (round) {
    clearTimeout(round.timeout);
    rounds.delete(channelId);
  }
}

async function endRoundTimeout(
  client: Client,
  channelId: string,
): Promise<void> {
  const round = rounds.get(channelId);
  if (!round) return;
  rounds.delete(channelId);

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel?.isTextBased() || channel.isDMBased()) return;
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(FLAG_START_COLOR)
          .setTitle("🚩 Flag round over")
          .setDescription("Time's up — nobody got it."),
      ],
    });
  } catch (err) {
    console.warn("[flagGame] Failed to post timeout message:", err);
  }
}

export async function startFlagRound(
  channel: TextChannel,
  _opts: { triggeredBy?: string } = {},
): Promise<boolean> {
  if (rounds.has(channel.id) || starting.has(channel.id)) {
    return false;
  }
  starting.add(channel.id);

  try {
    let country: Country | null = null;
    let flagPng: Buffer | null = null;
    for (let i = 0; i < FLAG_FETCH_ATTEMPTS; i++) {
      const candidate = pickRandomCountry();
      const buf = await fetchFlagPng(candidate.code);
      if (buf) {
        country = candidate;
        flagPng = buf;
        break;
      }
      console.warn(
        `[flagGame] Flag image fetch failed for ${candidate.code} — retrying`,
      );
    }

    if (!country || !flagPng) {
      console.error("[flagGame] Could not load any flag image — aborting round");
      return false;
    }

    const file = new AttachmentBuilder(flagPng, { name: FLAG_FILE });
    const embed = new EmbedBuilder()
      .setColor(FLAG_START_COLOR)
      .setTitle("🚩 Guess the flag!")
      .setDescription("**First to guess the flag wins**")
      .setImage(`attachment://${FLAG_FILE}`)
      .setFooter({ text: "Earn a point for winning" });

    const sent = await channel.send({ embeds: [embed], files: [file] });

    const timeout = setTimeout(() => {
      void endRoundTimeout(channel.client, channel.id);
    }, config.flagGameTimeoutSec * 1000);

    rounds.set(channel.id, {
      channelId: channel.id,
      guildId: channel.guildId,
      country,
      messageId: sent.id,
      startedAt: Date.now(),
      timeout,
    });

    console.log(
      `[flagGame] Round started in ${channel.id}: ${country.name} (${country.code})`,
    );
    return true;
  } catch (err) {
    console.error("[flagGame] Failed to start round:", err);
    return false;
  } finally {
    starting.delete(channel.id);
  }
}

/**
 * If there's an active round and this message is a correct guess, end it.
 * Returns true if the message was consumed as a winning guess.
 */
export async function tryFlagGuess(message: Message<true>): Promise<boolean> {
  const round = rounds.get(message.channel.id);
  if (!round) return false;

  if (!matchesCountry(message.content, round.country)) return false;

  clearRound(message.channel.id);

  const payload = await buildGameWinPayload({
    guildId: message.guildId,
    userId: message.author.id,
    reward: config.flagGameCurrencyReward,
    guild: message.guild,
    channel: message.channel,
    member: message.member,
  });

  await message.reply(payload);

  return true;
}
