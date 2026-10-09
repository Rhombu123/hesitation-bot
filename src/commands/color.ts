import type { Message, TextChannel } from "discord.js";
import {
  getActiveColorRound,
  startColorRound,
} from "../services/colorGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleColorCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Color games only work in server text channels.");
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

  if (getActiveColorRound(message.channel.id)) {
    await message.reply(
      "There's already a color round in this channel — pick a color!",
    );
    return;
  }

  const started = await startColorRound(message.channel as TextChannel);
  if (!started) {
    await message.reply("Couldn't start a color round right now. Try again.");
  }
}
