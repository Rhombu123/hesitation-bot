import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR, config } from "../config.js";
import {
  disableRaidLockdown,
  enableRaidLockdown,
  getRaidStatus,
} from "../services/antiRaid.js";
import { isStaffMember } from "../utils/staff.js";

/**
 * Staff: `!lockdown` [minutes] · `!unlock` · `!raidstatus`
 */
export async function handleLockdownCommand(
  message: Message<true>,
  args: string[],
  mode: "lockdown" | "unlock" | "status",
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member || !isStaffMember(member)) {
    await message.reply("Staff only.");
    return;
  }

  if (mode === "unlock") {
    disableRaidLockdown(message.guildId);
    await message.reply("Anti-raid lockdown **ended**.");
    return;
  }

  if (mode === "status") {
    const status = getRaidStatus(message.guildId);
    const embed = new EmbedBuilder()
      .setColor(EMBED_COLOR)
      .setAuthor({ name: "Anti-Raid Status" })
      .setDescription(
        [
          `• Enabled: **${config.antiRaidEnabled ? "yes" : "no"}**`,
          `• Lockdown: **${status.lockdown ? "active" : "off"}**`,
          status.lockdown
            ? `• Ends: <t:${Math.floor(status.lockdownUntil / 1000)}:R>`
            : null,
          `• Recent joins (window): **${status.recentJoins}** / threshold **${config.antiRaidJoinThreshold}**`,
          `• Action: **${config.antiRaidAction}**`,
        ]
          .filter(Boolean)
          .join("\n"),
      );
    await message.reply({ embeds: [embed] });
    return;
  }

  const minutes = Math.min(
    120,
    Math.max(1, Number.parseInt(args[0] ?? "", 10) || Math.round(config.antiRaidLockdownMs / 60_000)),
  );
  const until = enableRaidLockdown(message.guildId, minutes * 60_000);
  await message.reply(
    `Anti-raid lockdown **on** for **${minutes}m** (ends <t:${Math.floor(until / 1000)}:R>). New joins will be **${config.antiRaidAction === "kick" ? "kicked" : "timed out"}**.`,
  );
}
