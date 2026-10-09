import {
  EmbedBuilder,
  type GuildMember,
  type PartialGuildMember,
  type TextChannel,
} from "discord.js";
import { GAME_EMBED_COLOR } from "../config.js";
import { randomInt } from "../utils/helpers.js";
import { buildGameWinPayload } from "./gameWin.js";

const NICK_TIMEOUT_MS = 60_000;

const ADJECTIVES = [
  "Squiggle",
  "Eluded",
  "Horsey",
  "Bouncy",
  "Fuzzy",
  "Speedy",
  "Sleepy",
  "Wobbly",
  "Sparkly",
  "Cloudy",
  "Zesty",
  "Cheeky",
  "Dizzy",
  "Goofy",
  "Jolly",
  "Lucky",
  "Peppy",
  "Snappy",
  "Tippy",
  "Zippy",
  "Cosmic",
  "Dusty",
  "Frosty",
  "Giddy",
  "Nifty",
  "Plucky",
  "Quirky",
  "Rusty",
  "Silky",
  "Wacky",
] as const;

const NOUNS = [
  "Pony",
  "Eagle",
  "Lover",
  "Panda",
  "Tiger",
  "Wizard",
  "Noodle",
  "Pickle",
  "Cookie",
  "Banana",
  "Dragon",
  "Penguin",
  "Rocket",
  "Muffin",
  "Cactus",
  "Kitten",
  "Otter",
  "Falcon",
  "Goblin",
  "Raccoon",
  "Nugget",
  "Bubble",
  "Marsh",
  "Pixel",
  "Comet",
  "Biscuit",
  "Waffle",
  "Llama",
  "Turtle",
  "Phoenix",
] as const;

type ActiveNicknameRound = {
  channelId: string;
  guildId: string;
  messageId: string;
  targetName: string;
  ended: boolean;
  endTimer: ReturnType<typeof setTimeout>;
};

const roundsByChannel = new Map<string, ActiveNicknameRound>();

export function generateNicknameChallenge(): string {
  const adj = ADJECTIVES[randomInt(0, ADJECTIVES.length - 1)]!;
  const noun = NOUNS[randomInt(0, NOUNS.length - 1)]!;
  return `${adj}${noun}`;
}

export function getActiveNicknameRound(
  channelId: string,
): ActiveNicknameRound | undefined {
  return roundsByChannel.get(channelId);
}

function clearRound(channelId: string): void {
  const round = roundsByChannel.get(channelId);
  if (!round) return;
  clearTimeout(round.endTimer);
  roundsByChannel.delete(channelId);
}

function normalizeNick(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, "").toLowerCase();
}

function nickMatchesTarget(
  nickname: string | null | undefined,
  target: string,
): boolean {
  return normalizeNick(nickname) === normalizeNick(target);
}

/**
 * Nickname race — first member to set their server nick to the challenge wins
 * a point (no crate/loot/rep pool).
 *
 * Prompt is the embed title; the name is the *only* thing in the description
 * code block so Discord’s code-block copy button copies just the nickname.
 */
export async function startNicknameRound(
  channel: TextChannel,
): Promise<boolean> {
  if (roundsByChannel.has(channel.id)) return false;

  const targetName = generateNicknameChallenge();
  const embed = new EmbedBuilder()
    .setColor(GAME_EMBED_COLOR)
    .setTitle("First to change your name to:")
    .setDescription(`\`\`\`\n${targetName}\n\`\`\``)
    .setFooter({ text: "Earn a point for winning" })
    .setTimestamp();

  const sent = await channel.send({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  const endTimer = setTimeout(() => {
    void expireNicknameRound(channel, sent.id).catch((err) =>
      console.error("[nicknameGame] Expire failed:", err),
    );
  }, NICK_TIMEOUT_MS);

  roundsByChannel.set(channel.id, {
    channelId: channel.id,
    guildId: channel.guildId,
    messageId: sent.id,
    targetName,
    ended: false,
    endTimer,
  });

  console.log(
    `[nicknameGame] Started in ${channel.id} — target "${targetName}"`,
  );
  return true;
}

async function expireNicknameRound(
  channel: TextChannel,
  messageId: string,
): Promise<void> {
  const round = roundsByChannel.get(channel.id);
  if (!round || round.messageId !== messageId || round.ended) return;
  round.ended = true;
  clearRound(channel.id);

  const msg = await channel.messages.fetch(messageId).catch(() => null);
  if (msg) {
    const embed = new EmbedBuilder()
      .setColor(GAME_EMBED_COLOR)
      .setTitle("Round over")
      .setDescription(
        [
          "Nobody changed their name in time.",
          "",
          `Target was: \`${round.targetName}\``,
        ].join("\n"),
      )
      .setFooter({ text: "Try again next round" });
    await msg.edit({ embeds: [embed] }).catch(() => null);
  }
}

async function declareNicknameWinner(
  round: ActiveNicknameRound,
  member: GuildMember,
): Promise<void> {
  if (round.ended) return;
  round.ended = true;
  clearTimeout(round.endTimer);
  roundsByChannel.delete(round.channelId);

  const channel = await member.client.channels
    .fetch(round.channelId)
    .catch(() => null);
  const textChannel =
    channel && channel.isTextBased() && !channel.isDMBased()
      ? (channel as TextChannel)
      : null;

  // Points only — do not pass channel so loot / crate pool never rolls.
  const win = await buildGameWinPayload({
    guildId: round.guildId,
    userId: member.id,
    guild: member.guild,
  });

  if (textChannel) {
    await textChannel.send(win).catch((err) =>
      console.warn("[nicknameGame] Win announce failed:", err),
    );
    const msg = await textChannel.messages
      .fetch(round.messageId)
      .catch(() => null);
    if (msg) {
      const embed = new EmbedBuilder()
        .setColor(GAME_EMBED_COLOR)
        .setTitle("Round complete")
        .setDescription(
          `<@${member.id}> changed their name to \`${round.targetName}\` first!`,
        )
        .setFooter({ text: "Round complete" });
      await msg.edit({ embeds: [embed] }).catch(() => null);
    }
  }

  console.log(
    `[nicknameGame] ${member.user.tag} won with "${round.targetName}" in ${round.channelId}`,
  );
}

/**
 * Watch nickname changes for any active nickname round in this guild.
 * Call from GuildMemberUpdate.
 */
export async function tryHandleNicknameGameUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember,
): Promise<boolean> {
  const oldNick =
    "nickname" in oldMember ? oldMember.nickname : null;
  const newNick = newMember.nickname;
  if (oldNick === newNick) return false;

  for (const round of roundsByChannel.values()) {
    if (round.guildId !== newMember.guild.id) continue;
    if (round.ended) continue;
    if (!nickMatchesTarget(newNick, round.targetName)) continue;
    await declareNicknameWinner(round, newMember);
    return true;
  }
  return false;
}
