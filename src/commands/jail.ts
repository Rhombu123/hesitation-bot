import type { Message, TextChannel } from "discord.js";
import {
  BAIL_COST,
  DAILY_BAIL_LIMIT,
  DAILY_JAIL_LIMIT,
  bailSuccessEmbed,
  buildImmunityStatusEmbed,
  buildJailDeniedEmbed,
  buildJailOverviewEmbed,
  canStartJail,
  getDailyUsage,
  getJailCooldownRemainingMs,
  giftImmunity,
  equipImmunity,
  hasActiveImmunity,
  isUserJailed,
  listActiveJails,
  overviewButtons,
  performBail,
  startJailVote,
} from "../services/jail.js";
import { InsufficientCreditsError } from "../services/credits.js";
import { hasMythic, hasSupreme } from "../config/rolePrivileges.js";
import { formatWaitDuration } from "../services/reputation.js";
import { isStaffMember } from "../utils/staff.js";
import { resolveMemberTarget } from "../utils/resolveMember.js";

export async function handleJailCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  const sub = (args[0] ?? "").toLowerCase();

  if (sub === "list") {
    const rows = await listActiveJails(message.guildId);
    if (rows.length === 0) {
      await message.reply("Nobody is jailed right now.");
      return;
    }
    const lines = rows.map(
      (r) =>
        `• <@${r.userId}> — ends <t:${Math.floor(r.expiresAt.getTime() / 1000)}:R>`,
    );
    await message.reply({
      content: ["**Currently jailed:**", ...lines].join("\n"),
      allowedMentions: { parse: [] },
    });
    return;
  }

  const target = await resolveMemberTarget(message, args);
  if (!target || target.id === message.author.id) {
    if (!canStartJail(member)) {
      const { embed, components } = buildJailDeniedEmbed(message.guild);
      await message.reply({ embeds: [embed], components });
      return;
    }
    const usage = await getDailyUsage(message.guildId, member.id);
    await message.reply({
      embeds: [buildJailOverviewEmbed(usage.jailsStarted)],
      components: [overviewButtons()],
    });
    return;
  }

  if (!canStartJail(member)) {
    const { embed, components } = buildJailDeniedEmbed(message.guild);
    await message.reply({ embeds: [embed], components });
    return;
  }

  if (target.user.bot) {
    await message.reply("You can't jail bots.");
    return;
  }
  if (isStaffMember(target)) {
    await message.reply("You can't jail staff members.");
    return;
  }
  if ((hasSupreme(target) || hasMythic(target)) && !isStaffMember(member)) {
    await message.reply("You can't jail **Supreme** or **Mythic** members.");
    return;
  }
  if (await hasActiveImmunity(message.guildId, target.id)) {
    await message.reply(`${target} has **Jail Immunity** active.`);
    return;
  }
  if (await isUserJailed(message.guildId, target.id)) {
    await message.reply(`${target} is already jailed.`);
    return;
  }

  const usage = await getDailyUsage(message.guildId, member.id);
  if (usage.jailsStarted >= DAILY_JAIL_LIMIT) {
    await message.reply(
      `You've used all **${DAILY_JAIL_LIMIT}** daily jail votes.`,
    );
    return;
  }

  const cooldownMs = getJailCooldownRemainingMs(usage.lastJailAt);
  if (cooldownMs > 0) {
    await message.reply(
      `Wait **${formatWaitDuration(cooldownMs)}** before starting another jail vote.`,
    );
    return;
  }

  if (!message.channel.isTextBased() || message.channel.isDMBased()) {
    await message.reply("Use this in a server text channel.");
    return;
  }

  try {
    await startJailVote(message.channel as TextChannel, member, target);
  } catch (err) {
    console.error("[jail] start vote failed:", err);
    await message.reply("Couldn't start a jail vote right now.");
  }
}

export async function handleBailCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const bailer =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!bailer) return;

  const target = await resolveMemberTarget(message, args);
  if (!target || target.id === bailer.id) {
    await message.reply(
      `Usage: \`!bail @user\` — costs **${BAIL_COST.toLocaleString()}** credits.`,
    );
    return;
  }

  try {
    const { bailsUsed } = await performBail(bailer, target);
    await message.reply({
      embeds: [bailSuccessEmbed(target, bailer, bailsUsed)],
      allowedMentions: { users: [target.id, bailer.id] },
    });
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      await message.reply(
        `You need **${BAIL_COST.toLocaleString()}** credits to bail someone out.`,
      );
      return;
    }
    if (err instanceof Error && err.message === "BAIL_LIMIT") {
      await message.reply(`You've used all **${DAILY_BAIL_LIMIT}** daily bails.`);
      return;
    }
    if (err instanceof Error && err.message === "NOT_JAILED") {
      await message.reply(`${target} isn't jailed.`);
      return;
    }
    await message.reply("Couldn't bail that user right now.");
  }
}

export async function handleImmunityCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const member =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!member) return;

  const sub = (args[0] ?? "").toLowerCase();

  if (sub === "gift") {
    const kind = args.find((a) => a === "weekly" || a === "monthly");
    const target =
      message.mentions.members?.first() ??
      (await (async () => {
        const idArg = args.find((a) => /^\d{15,21}$/.test(a.replace(/[<@!>]/g, "")));
        if (!idArg) return null;
        return message.guild.members
          .fetch(idArg.replace(/[<@!>]/g, ""))
          .catch(() => null);
      })());

    if (!target || kind !== "weekly") {
      await message.reply(
        "Usage: `!immunity gift @user weekly`",
      );
      return;
    }
    if (target.id === member.id) {
      await message.reply("Gift immunity to someone else.");
      return;
    }
    try {
      await giftImmunity(member, target, kind);
      await message.reply(
        `Gifted **${kind}** Jail Immunity to ${target}.`,
      );
    } catch (err) {
      if (err instanceof Error && err.message === "NO_TOKEN") {
        await message.reply(
          "You don't have a **weekly** immunity token. Win **Genius**, **Popular**, or **Collector** for the week.",
        );
        return;
      }
      await message.reply("Couldn't gift immunity right now.");
    }
    return;
  }

  if (sub === "weekly") {
    try {
      await equipImmunity(member, "weekly");
      await message.reply({
        embeds: [
          await buildImmunityStatusEmbed(message.guildId, member.id),
        ],
      });
    } catch (err) {
      if (err instanceof Error && err.message === "NO_TOKEN") {
        await message.reply(
          "You don't have a **weekly** immunity token. Win **Genius**, **Popular**, or **Collector** for the week.",
        );
        return;
      }
      await message.reply("Couldn't equip immunity right now.");
    }
    return;
  }

  if (sub === "monthly") {
    await message.reply(
      "Only **weekly** immunity tokens are used — they reset with Genius / Popular / Collector crowns.",
    );
    return;
  }

  await message.reply({
    embeds: [await buildImmunityStatusEmbed(message.guildId, member.id)],
  });
}
