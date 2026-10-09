import {
  EmbedBuilder,
  type Client,
  type Message,
  type TextChannel,
} from "discord.js";
import { config, GAME_EMBED_COLOR } from "../config.js";
import {
  matchesLanguage,
  pickRandomLanguagePrompt,
  type LanguagePrompt,
} from "../data/languages.js";
import {
  CROWN_EMOJI_ID,
  CROWN_EMOJI_NAME,
  resolveEmojiById,
} from "../utils/customEmojis.js";
import { buildGameWinPayload } from "./gameWin.js";

/** Socialize-style yellow for the prompt embed. */
const LANG_START_COLOR = 0x143b96;

/** Twemoji closed book — matches the Socialize Games thumbnail vibe. */
const LANG_THUMB_URL =
  "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4d5.png";

type ActiveRound = {
  channelId: string;
  guildId: string;
  prompt: LanguagePrompt;
  messageId: string;
  startedAt: number;
  timeout: ReturnType<typeof setTimeout>;
};

/** channelId → active round */
const rounds = new Map<string, ActiveRound>();

export function getActiveLangRound(channelId: string): ActiveRound | undefined {
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
    const guild = "guild" in channel ? channel.guild : null;
    const crown = await resolveEmojiById(guild, CROWN_EMOJI_ID, CROWN_EMOJI_NAME);
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(GAME_EMBED_COLOR)
          .setTitle(`${crown} Language round over`)
          .setDescription(
            `Time's up — nobody got it.\nThe answer was **${round.prompt.language}**.`,
          ),
      ],
    });
  } catch (err) {
    console.warn("[langGame] Failed to post timeout message:", err);
  }
}

export async function startLangRound(
  channel: TextChannel,
  _opts: { triggeredBy?: string } = {},
): Promise<boolean> {
  if (rounds.has(channel.id)) {
    return false;
  }

  const prompt = pickRandomLanguagePrompt();
  const crown = await resolveEmojiById(
    channel.guild,
    CROWN_EMOJI_ID,
    CROWN_EMOJI_NAME,
  );
  const embed = new EmbedBuilder()
    .setColor(LANG_START_COLOR)
    .setTitle(`${crown} Guess the Language!`)
    .setDescription(`📝 **What language is \`${prompt.word}\`?**`)
    .setThumbnail(LANG_THUMB_URL)
    .setFooter({ text: "Earn a point for winning" });

  const sent = await channel.send({ embeds: [embed] });

  const timeout = setTimeout(() => {
    void endRoundTimeout(channel.client, channel.id);
  }, config.langGameTimeoutSec * 1000);

  rounds.set(channel.id, {
    channelId: channel.id,
    guildId: channel.guildId,
    prompt,
    messageId: sent.id,
    startedAt: Date.now(),
    timeout,
  });

  console.log(
    `[langGame] Round started in ${channel.id}: ${prompt.word} → ${prompt.language}`,
  );
  return true;
}

/**
 * If there's an active round and this message is a correct guess, end it.
 * Returns true if the message was consumed as a winning guess.
 */
export async function tryLangGuess(message: Message<true>): Promise<boolean> {
  const round = rounds.get(message.channel.id);
  if (!round) return false;

  if (!matchesLanguage(message.content, round.prompt)) return false;

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
