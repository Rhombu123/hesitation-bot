import {
  EmbedBuilder,
  type Message,
} from "discord.js";
import {
  canUseCustomRoleGradient,
  getDailyBoostLimit,
  hasSupremeAccess,
} from "../config/rolePrivileges.js";
import {
  ensureSolidCustomRoleColor,
  getCustomRoleByOwner,
} from "../services/customRoles.js";
import {
  getDailyBoostsUsed,
  recordRoleBoost,
} from "../services/roleBoosts.js";
import { formatWaitDuration, msUntilNextUtcMidnight } from "../services/reputation.js";

const BOOST_COLOR = 0xfbbf24;

function buildBoostedEmbed(opts: {
  targetMention: string;
  amount: number;
  dailyLeft: number;
  dailyLimit: number;
  iconURL?: string;
}): EmbedBuilder {
  const wait = formatWaitDuration(msUntilNextUtcMidnight());
  return new EmbedBuilder()
    .setColor(BOOST_COLOR)
    .setAuthor({
      name: "Role Boosted",
      ...(opts.iconURL ? { iconURL: opts.iconURL } : {}),
    })
    .setDescription(
      [
        `⚡ You **__boosted__** ${opts.targetMention} (+${opts.amount})`,
        "",
        `ℹ️ **Daily Boosts left:** ${opts.dailyLeft}/${opts.dailyLimit}`,
        "",
        "Unlock more daily boosts with VIP / Elite / Supreme / Mythic!",
      ].join("\n"),
    )
    .setFooter({ text: `Next daily boost: ${wait}` });
}

/** Resolve amount from args: `all` → remaining, else a number, else 1. */
function resolveBoostAmount(
  args: string[],
  left: number,
  dailyLimit: number,
): number {
  if (args.some((a) => a.toLowerCase() === "all")) {
    return Math.max(0, left);
  }
  for (const raw of args) {
    if (/^\d+$/.test(raw)) {
      const n = Number(raw);
      if (n >= 1 && n <= dailyLimit) return n;
    }
  }
  return 1;
}

export async function handleBoostCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const booster =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!booster) {
    await message.reply("Could not load your member profile.");
    return;
  }

  const dailyLimit = getDailyBoostLimit(booster);

  let target = message.mentions.members?.first() ?? null;
  if (!target && args[0]) {
    const id = args[0].replace(/[<@!>]/g, "");
    if (/^\d{15,21}$/.test(id)) {
      target = await message.guild.members.fetch(id).catch(() => null);
    }
  }
  if (!target) {
    await message.reply(
      `Who should get the boost? Usage: \`!boost @supreme-user\` (optional amount or \`all\`). Your daily max: **${dailyLimit}**.`,
    );
    return;
  }
  if (target.user.bot) {
    await message.reply("You can't boost bots.");
    return;
  }
  if (target.id === booster.id) {
    await message.reply("You can't boost yourself.");
    return;
  }
  if (!hasSupremeAccess(target)) {
    await message.reply(
      "You can only boost **Supreme / Mythic** members who own a custom role.",
    );
    return;
  }

  const custom = await getCustomRoleByOwner(message.guildId, target.id);
  if (!custom) {
    await message.reply(
      `<@${target.id}> doesn't have a custom role yet — they need to run \`!role setup\` first.`,
    );
    return;
  }

  const usedBefore = await getDailyBoostsUsed(message.guildId, booster.id);
  const leftBefore = Math.max(0, dailyLimit - usedBefore);
  const iconURL = booster.displayAvatarURL({ size: 64 });
  const amount = resolveBoostAmount(args, leftBefore, dailyLimit);

  if (leftBefore <= 0 || amount <= 0) {
    const wait = formatWaitDuration(msUntilNextUtcMidnight());
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(BOOST_COLOR)
          .setAuthor({
            name: "Role Boosted",
            ...(iconURL ? { iconURL } : {}),
          })
          .setDescription(
            [
              `You've used all **${dailyLimit}** daily boosts.`,
              "",
              `ℹ️ **Daily Boosts left:** 0/${dailyLimit}`,
              "",
              "Unlock more daily boosts with VIP / Elite / Supreme / Mythic!",
            ].join("\n"),
          )
          .setFooter({ text: `Next daily boost: ${wait}` }),
      ],
    });
    return;
  }

  if (amount > leftBefore) {
    await message.reply(
      `You only have **${leftBefore}** boost${leftBefore === 1 ? "" : "s"} left today (max **${dailyLimit}**).`,
    );
    return;
  }

  try {
    await recordRoleBoost({
      guildId: message.guildId,
      fromUserId: booster.id,
      toOwnerId: target.id,
      discordRoleId: custom.discordRoleId,
      amount,
      dailyLimit,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DAILY_LIMIT") {
      await message.reply("You're out of daily boosts.");
      return;
    }
    console.error("[boost]", err);
    await message.reply("Couldn't record that boost right now.");
    return;
  }

  const leftAfter = Math.max(0, dailyLimit - (usedBefore + amount));

  const role = await message.guild.roles
    .fetch(custom.discordRoleId)
    .catch(() => null);
  if (role) {
    await ensureSolidCustomRoleColor(role, {
      allowGradient: canUseCustomRoleGradient(target),
    });
  }

  await message.reply({
    embeds: [
      buildBoostedEmbed({
        targetMention: `${target}`,
        amount,
        dailyLeft: leftAfter,
        dailyLimit,
        iconURL,
      }),
    ],
    allowedMentions: { users: [target.id] },
  });
}
