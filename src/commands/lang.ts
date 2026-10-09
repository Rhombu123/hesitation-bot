import type { Message, TextChannel } from "discord.js";
import {
  getActiveLangRound,
  startLangRound,
} from "../services/langGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleLangCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Language games only work in server text channels.");
    return;
  }
  if (await rejectUnlessGamesChannel(message)) return;

  const author =
    message.member ??
    (await message.guild.members
      .fetch({ user: message.author.id, force: true })
      .catch(() => null));

  if (!author) {
    await message.reply("Could not load your member profile. Try again.");
    return;
  }

  if (!canSpawnGames(author)) {
    await message.reply(NO_SPAWN_GAMES_PERMISSION);
    return;
  }

  if (getActiveLangRound(message.channel.id)) {
    await message.reply(
      "There's already a language round in this channel — guess the language!",
    );
    return;
  }

  const started = await startLangRound(message.channel as TextChannel, {
    triggeredBy: message.author.id,
  });

  if (!started) {
    await message.reply(
      "Couldn't start a language round right now. Try again.",
    );
  }
}
