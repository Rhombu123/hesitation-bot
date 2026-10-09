import type { Message } from "discord.js";

const CONFIRM_DELETE_MS = 8_000;
const DISCORD_NICK_MAX = 32;

/**
 * `!nick <name>` / `!nickname <name>` — set your own server nickname.
 * Confirmation is deleted after a few seconds (dismissable from channel).
 */
export async function handleNickCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Could not load your member profile. Try again.");
    return;
  }

  const nick = args.join(" ").trim();
  if (!nick) {
    await message.reply(
      "Usage: `!nick <name>` or `!nickname <name>`\nExample: `!nick SquigglePony`",
    );
    return;
  }

  if (nick.length > DISCORD_NICK_MAX) {
    await message.reply(
      `Nicknames can be at most **${DISCORD_NICK_MAX}** characters.`,
    );
    return;
  }

  const me = message.guild.members.me;
  if (!me?.permissions.has("ManageNicknames")) {
    await message.reply(
      "I need **Manage Nicknames** to change nicknames for you.",
    );
    return;
  }

  if (
    member.id !== message.guild.ownerId &&
    me.roles.highest.position <= member.roles.highest.position
  ) {
    await message.reply(
      "I can't change your nickname — my role needs to be **above** yours.",
    );
    return;
  }

  try {
    await member.setNickname(nick, `!nick by ${message.author.tag}`);
  } catch (err) {
    console.warn("[nick] setNickname failed:", err);
    await message.reply(
      "Couldn't change your nickname. Check my **Manage Nicknames** permission and role order.",
    );
    return;
  }

  const confirm = await message.reply({
    content: `Nickname set to **${nick}**.`,
    allowedMentions: { parse: [] },
  });

  setTimeout(() => {
    void confirm.delete().catch(() => null);
  }, CONFIRM_DELETE_MS);
}
