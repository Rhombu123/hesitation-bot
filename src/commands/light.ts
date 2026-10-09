import type { Message, TextChannel } from "discord.js";
import {
  getActiveLightRound,
  startLightRound,
} from "../services/lightGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleLightCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Light games only work in server text channels.");
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

  if (getActiveLightRound(message.channel.id)) {
    await message.reply(
      "There's already a light round in this channel — wait for green!",
    );
    return;
  }

  const started = await startLightRound(message.channel as TextChannel);
  if (!started) {
    await message.reply("Couldn't start a light round right now. Try again.");
  }
}
