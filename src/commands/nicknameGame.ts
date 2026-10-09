import type { Message, TextChannel } from "discord.js";
import {
  getActiveNicknameRound,
  startNicknameRound,
} from "../services/nicknameGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleNicknameGameCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Nickname games only work in server text channels.");
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

  if (getActiveNicknameRound(message.channel.id)) {
    await message.reply(
      "There's already a nickname race in this channel.",
    );
    return;
  }

  const started = await startNicknameRound(message.channel as TextChannel);
  if (!started) {
    await message.reply(
      "Couldn't start a nickname round right now. Try again.",
    );
  }
}
