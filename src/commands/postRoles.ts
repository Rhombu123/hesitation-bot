import type { Message, TextChannel } from "discord.js";
import { postProfileRolesPanels } from "../services/profileRoles.js";
import { isStaffMember } from "../utils/staff.js";

/**
 * Staff-only: post Gender / Age / Region self-assign role panels.
 * Usage: `!postroles` (run in the roles channel)
 */
export async function handlePostRolesCommand(
  message: Message<true>,
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || !isStaffMember(member)) {
    await message.reply("Staff only.");
    return;
  }

  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Use this in a server text channel.");
    return;
  }

  const channel = message.channel as TextChannel;
  const sent = await postProfileRolesPanels(channel);

  await message
    .reply({
      content: `Posted Gender / Age / Region role panels → ${sent[0]!.url}`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
}
