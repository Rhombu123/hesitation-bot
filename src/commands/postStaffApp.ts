import type { Message, TextChannel } from "discord.js";
import { config } from "../config.js";
import { postStaffApplicationMessage } from "../services/staffApplication.js";
import { isStaffMember } from "../utils/staff.js";

/**
 * Staff-only: post the staff application embed.
 * Usage: `!poststaffapp` (posts to STAFF_APPLICATION_CHANNEL_ID when set).
 */
export async function handlePostStaffAppCommand(
  message: Message<true>,
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || !isStaffMember(member)) {
    await message.reply("Staff only.");
    return;
  }

  const targetId = config.staffApplicationChannelId;
  let channel: TextChannel;

  if (targetId) {
    const fetched = await message.client.channels
      .fetch(targetId)
      .catch(() => null);
    if (!fetched?.isTextBased() || fetched.isDMBased()) {
      await message.reply(
        `Could not find staff application channel \`${targetId}\`.`,
      );
      return;
    }
    channel = fetched as TextChannel;
  } else if (message.channel.isTextBased() && !message.channel.isDMBased()) {
    channel = message.channel as TextChannel;
  } else {
    await message.reply("Use this in a server text channel.");
    return;
  }

  const sent = await postStaffApplicationMessage(channel);

  await message
    .reply({
      content: `Posted staff application embed → ${sent.url}`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);
}
