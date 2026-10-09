import type { Message, TextChannel } from "discord.js";
import {
  getActiveWordReverseRound,
  startWordReverseRound,
} from "../services/wordReverseGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleBackCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Word reverse games only work in server text channels.");
    return;
  }
  if (await rejectUnlessGamesChannel(message)) return;

  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || !canSpawnGames(member)) {
    await message.reply(NO_SPAWN_GAMES_PERMISSION);
    return;
  }

  if (getActiveWordReverseRound(message.channel.id)) {
    await message.reply(
      "A word reverse round is already active in this channel.",
    );
    return;
  }

  const started = await startWordReverseRound(message.channel as TextChannel);
  if (!started) {
    await message.reply(
      "Couldn't start a word reverse round right now. Try again.",
    );
  }
}
