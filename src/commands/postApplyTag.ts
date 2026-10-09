import type { Message, TextChannel } from "discord.js";
import { postApplyOurTagMessage } from "../services/applyOurTag.js";
import { isStaffMember } from "../utils/staff.js";

/**
 * Staff-only: post the Socialize-style “apply our tag” embed in this channel.
 * Usage: `!postapplytag` (run inside `#apply-our-tag`)
 */
export async function handlePostApplyTagCommand(
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
  const sent = await postApplyOurTagMessage(channel, {
    serverTagName: "MOON",
    reactGoat: true,
  });

  await message
    .reply({
      content: `Posted apply-tag instructions → ${sent.url}`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
}
