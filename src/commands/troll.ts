import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { hasMythic, ROLE_IDS } from "../config/rolePrivileges.js";
import { canCastUwuify } from "../utils/staff.js";

function canUseTrollMenu(member: NonNullable<Message["member"]>): boolean {
  return canCastUwuify(member) || hasMythic(member);
}

function buildTrollDeniedEmbed(
  guild: NonNullable<Message["guild"]>,
): EmbedBuilder {
  const roleId = ROLE_IDS.mythic || "1540805524033896469";
  const role = guild.roles.cache.get(roleId);
  const req = role ? `<@&${role.id}>` : "**Mythic**";
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(`You must have ${req} to run this command`);
}

function buildTrollMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setAuthor({ name: "Mythic Trolls" })
    .setDescription(
      [
        "Trolls you can use in the lounges:",
        "",
        "🥺 **Uwuify**",
        "`!uwuify @user [duration]` — rewrite their lounge messages",
        "`!uwuify @user stop` — end early",
        "_Mythic: up to **1 minute** · **15m** cast cooldown_",
        "",
        "👻 **Invisible**",
        "`!invisible @user [duration]` — blank their lounge messages",
        "`!invisible @user stop` — end early",
        "_Mythic: up to **2 minutes** · **15m** cast cooldown_",
        "",
        "Duration examples: `1min`, `2h`, `3d`, `1w`",
      ].join("\n"),
    );
}

/**
 * Mythic / staff: list available troll commands (`!uwuify`, `!invisible`).
 */
export async function handleTrollCommand(
  message: Message<true>,
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) {
    await message.reply("Couldn't load your member profile. Try again.");
    return;
  }

  if (!canUseTrollMenu(member)) {
    await message.guild.roles.fetch().catch(() => null);
    await message.reply({
      embeds: [buildTrollDeniedEmbed(message.guild)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  await message.reply({
    embeds: [buildTrollMenuEmbed()],
    allowedMentions: { parse: [] },
  });
}
