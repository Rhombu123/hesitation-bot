import type { Message, TextChannel } from "discord.js";
import { getRecentChatterIds } from "../services/gameAutoSpawn.js";
import {
  getActiveVoteRound,
  startVoteRound,
} from "../services/voteGame.js";
import { rejectUnlessGamesChannel } from "../utils/gamesChannel.js";
import { canSpawnGames, NO_SPAWN_GAMES_PERMISSION } from "../utils/staff.js";

export async function handleVoteCommand(
  message: Message<true>,
): Promise<void> {
  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Voting games only work in server text channels.");
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

  if (getActiveVoteRound(message.channel.id)) {
    await message.reply("There's already a vote running in this channel.");
    return;
  }

  // Include the command author so staff can still start with a thin chat pool.
  const chatters = new Set(getRecentChatterIds(message.channel.id, 5));
  chatters.add(message.author.id);

  // Pull a couple more recent message authors from the channel if needed.
  if (chatters.size < 2) {
    const recent = await message.channel.messages
      .fetch({ limit: 30 })
      .catch(() => null);
    if (recent) {
      for (const m of recent.values()) {
        if (m.author.bot) continue;
        chatters.add(m.author.id);
        if (chatters.size >= 5) break;
      }
    }
  }

  if (chatters.size < 2) {
    await message.reply(
      "Need at least **2** recent chatters to start a vote. Get people talking first.",
    );
    return;
  }

  const started = await startVoteRound(
    message.channel as TextChannel,
    [...chatters],
  );
  if (!started) {
    await message.reply("Couldn't start a vote right now. Try again.");
  }
}
