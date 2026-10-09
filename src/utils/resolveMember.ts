import type { GuildMember, Message } from "discord.js";

/** Resolve an optional mention/ID arg to a guild member, or the message author. */
export async function resolveMemberTarget(
  message: Message<true>,
  args: string[],
): Promise<GuildMember | null> {
  const mentioned = message.mentions.members?.first();
  if (mentioned) return mentioned;

  if (args[0]) {
    const id = args[0].replace(/[<@!>]/g, "");
    if (/^\d{15,21}$/.test(id)) {
      const byId = await message.guild.members.fetch(id).catch(() => null);
      if (byId) return byId;
    }
    return null;
  }

  return (
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null))
  );
}
