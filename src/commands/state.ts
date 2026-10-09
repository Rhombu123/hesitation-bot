import type { Message, TextChannel } from "discord.js";
import {
  getActiveStateRound,
  startStateRound,
} from "../services/stateGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleStateCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Statement games only work in server text channels.");
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

  if (getActiveStateRound(message.channel.id)) {
    await message.reply(
      "A statement round is already active in this channel.",
    );
    return;
  }

  const started = await startStateRound(message.channel as TextChannel);
  if (!started) {
    await message.reply(
      "Couldn't start a statement round right now. Try again.",
    );
  }
}
