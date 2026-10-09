import type { Message, TextChannel } from "discord.js";
import {
  getActiveReactRound,
  startReactRound,
} from "../services/reactGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleReactCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("React games only work in server text channels.");
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

  if (getActiveReactRound(message.channel.id)) {
    await message.reply(
      "There's already a First to React round in this channel.",
    );
    return;
  }

  const started = await startReactRound(message.channel as TextChannel);
  if (!started) {
    await message.reply("Couldn't start a react round right now. Try again.");
  }
}
