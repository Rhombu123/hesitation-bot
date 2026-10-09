import {
  EmbedBuilder,
  type GuildMember,
  type Message,
} from "discord.js";
import {
  BLESS_TARGET_COOLDOWN_MS,
  blessTargetCooldownKey,
  consumeDailyBless,
  getBlessTier,
  getDailyBlessesUsed,
} from "../services/bless.js";
import { setBlessRole } from "../services/blessRole.js";
import { grantBlessBoost } from "../services/xpBoosters.js";
import {
  claimCooldownMs,
  cooldownRemainingMs,
} from "../db/redis.js";
import {
  formatWaitDuration,
  msUntilNextUtcMidnight,
} from "../services/reputation.js";

const BLESS_COLOR = 0x143b96;

async function resolveBlessTarget(
  message: Message<true>,
  args: string[],
): Promise<GuildMember | null> {
  const mentioned = message.mentions.members?.first();
  if (mentioned) return mentioned;

  if (message.reference?.messageId) {
    const replied = await message.channel.messages
      .fetch(message.reference.messageId)
      .catch(() => null);
    if (replied && !replied.author.bot) {
      return message.guild.members.fetch(replied.author.id).catch(() => null);
    }
  }

  const raw = args[0]?.replace(/[<@!>]/g, "");
  if (raw && /^\d{15,21}$/.test(raw)) {
    return message.guild.members.fetch(raw).catch(() => null);
  }

  return null;
}

export async function handleBlessCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const blesser =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!blesser) {
    await message.reply("Could not load your member profile.");
    return;
  }

  const tier = getBlessTier(blesser);
  if (!tier) {
    await message.reply(
      "You need **VIP**, **Elite**, **Supreme**, or **Mythic** to bless someone.",
    );
    return;
  }

  const target = await resolveBlessTarget(message, args);
  if (!target) {
    await message.reply(
      "Who should get the blessing? Usage: `!bless @user` or reply with `!bless`.",
    );
    return;
  }
  if (target.user.bot) {
    await message.reply("You can't bless bots.");
    return;
  }
  if (target.id === blesser.id) {
    await message.reply("You can't bless yourself.");
    return;
  }

  const cdKey = blessTargetCooldownKey(
    message.guildId,
    blesser.id,
    target.id,
  );
  const remaining = await cooldownRemainingMs(cdKey);
  if (remaining > 0) {
    await message.reply(
      `You already blessed <@${target.id}> recently. Try again in **${formatWaitDuration(remaining)}**.`,
    );
    return;
  }

  const iconURL = blesser.displayAvatarURL({ size: 64 });

  const used = await getDailyBlessesUsed(message.guildId, blesser.id);
  if (used >= tier.dailyLimit) {
    const wait = formatWaitDuration(msUntilNextUtcMidnight());
    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(BLESS_COLOR)
          .setAuthor({
            name: tier.name,
            ...(iconURL ? { iconURL } : {}),
          })
          .setDescription(
            [
              `You've used all **${tier.dailyLimit}** ${tier.name.toLowerCase()}s today.`,
              "",
              `Next reset: **${wait}**`,
            ].join("\n"),
          ),
      ],
    });
    return;
  }

  try {
    const claim = await claimCooldownMs(cdKey, BLESS_TARGET_COOLDOWN_MS);
    if (!claim.ok) {
      await message.reply(
        `You already blessed <@${target.id}> recently. Try again in **${formatWaitDuration(claim.retryInMs)}**.`,
      );
      return;
    }

    const { left } = await consumeDailyBless({
      guildId: message.guildId,
      userId: blesser.id,
      limit: tier.dailyLimit,
    });

    const boost = await grantBlessBoost(
      message.guildId,
      target.id,
      tier.multiplier,
    );
    await setBlessRole(message.guild, target.id, true).catch((err) =>
      console.warn("[bless] Role grant failed:", err),
    );
    const exp = Math.floor(new Date(boost.expiresAt).getTime() / 1000);

    await message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(BLESS_COLOR)
          .setAuthor({
            name: tier.name,
            ...(iconURL ? { iconURL } : {}),
          })
          .setDescription(
            [
              `✨ You blessed <@${target.id}> with a **${tier.name}** (**${boost.multiplier}× XP**)`,
              "",
              `⏱️ Boost active until <t:${exp}:R>`,
              `🕊️ Blessings left today: **${left}/${tier.dailyLimit}**`,
            ].join("\n"),
          )
          .setFooter({
            text: `Daily blessings reset in ${formatWaitDuration(msUntilNextUtcMidnight())}`,
          }),
      ],
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DAILY_LIMIT") {
      const wait = formatWaitDuration(msUntilNextUtcMidnight());
      await message.reply(
        `You've used all **${tier.dailyLimit}** blessings today. Next reset: **${wait}**.`,
      );
      return;
    }
    console.error("[bless] failed:", err);
    await message.reply("Couldn't apply that blessing right now. Try again.");
  }
}
