import { EmbedBuilder, type Message } from "discord.js";
import { EMBED_COLOR } from "../config.js";
import { hasMythic, ROLE_IDS } from "../config/rolePrivileges.js";
import {
  INVISIBLE_DEFAULT_DURATION_MS,
  INVISIBLE_MYTHIC_MAX_MS,
  STAFF_MAX_MS,
  buildInvisibleEmbed,
  buildInvisibleStoppedEmbed,
  clearInvisibleSession,
  formatInvisibleDuration,
  getInvisibleCastCooldownRemaining,
  getInvisibleSession,
  markInvisibleCast,
  parseInvisibleDurationOrDefault,
  setInvisibleSession,
} from "../services/invisible.js";
import { canCastUwuify, isDiscordAdmin, isStaffMember } from "../utils/staff.js";

function canUseInvisible(member: NonNullable<Message["member"]>): boolean {
  return canCastUwuify(member) || hasMythic(member);
}

function buildInvisibleDeniedEmbed(
  guild: NonNullable<Message["guild"]>,
): EmbedBuilder {
  const roleId = ROLE_IDS.mythic || "1540805524033896469";
  const role = guild.roles.cache.get(roleId);
  const req = role ? `<@&${role.id}>` : "**Mythic**";
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setDescription(`You must have ${req} to run this command`);
}

/**
 * Target rules (same as uwuify):
 * - Staff / admins can invisible anyone (incl. Mythic)
 * - Mythic (non-staff) cannot invisible staff
 */
function canTargetInvisible(
  caster: NonNullable<Message["member"]>,
  target: NonNullable<Message["member"]>,
): { ok: true } | { ok: false; reason: string } {
  if (target.id === caster.id) {
    return { ok: false, reason: "You can't make yourself invisible." };
  }
  if (target.user.bot) {
    return { ok: false, reason: "You can't make bots invisible." };
  }
  if (canCastUwuify(caster)) {
    return { ok: true };
  }
  if (hasMythic(caster)) {
    if (isStaffMember(target)) {
      return {
        ok: false,
        reason: "Mythic holders can't make **staff** members invisible.",
      };
    }
    return { ok: true };
  }
  return { ok: false, reason: "You can't use `!invisible`." };
}

function resolveTarget(
  message: Message<true>,
  args: string[],
): Promise<NonNullable<Message["member"]> | null> {
  const mentioned = message.mentions.members?.first();
  if (mentioned) return Promise.resolve(mentioned);

  const raw = args[0]?.replace(/[<@!>]/g, "");
  if (raw && /^\d{15,21}$/.test(raw)) {
    return message.guild.members.fetch(raw).catch(() => null);
  }
  return Promise.resolve(null);
}

function isStopArg(args: string[]): boolean {
  return args.some((a) => a.toLowerCase() === "stop");
}

function durationArgFrom(args: string[]): string | undefined {
  return args.find((a) => {
    const lower = a.toLowerCase();
    if (lower === "stop") return false;
    if (a.startsWith("<@")) return false;
    if (/^\d{15,21}$/.test(a.replace(/[<@!>]/g, ""))) return false;
    return true;
  });
}

export async function handleInvisibleCommand(
  message: Message<true>,
  args: string[],
): Promise<void> {
  const caster =
    message.member ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (!caster) {
    await message.reply("Couldn't load your member profile. Try again.");
    return;
  }

  if (!canUseInvisible(caster)) {
    await message.guild.roles.fetch().catch(() => null);
    await message.reply({
      embeds: [buildInvisibleDeniedEmbed(message.guild)],
      allowedMentions: { parse: [] },
    });
    return;
  }

  const target = await resolveTarget(message, args);
  if (!target) {
    await message.reply(
      "Usage: `!invisible @user [duration]` or `!invisible @user stop`.\n" +
        "Duration examples: `1min`, `2h`, `3d`, `1w` (default **2 minutes**).",
    );
    return;
  }

  const gate = canTargetInvisible(caster, target);
  if (!gate.ok) {
    await message.reply(gate.reason);
    return;
  }

  if (isStopArg(args)) {
    const active = getInvisibleSession(target.id);
    if (!active) {
      await message.reply(
        `<@${target.id}> is not currently invisible.`,
      );
      return;
    }
    clearInvisibleSession(target.id);
    await message.reply({
      embeds: [buildInvisibleStoppedEmbed(target.id)],
      allowedMentions: { users: [target.id] },
    });
    return;
  }

  const durationMs = parseInvisibleDurationOrDefault(durationArgFrom(args));
  if (durationMs == null) {
    await message.reply(
      "Invalid duration. Use something like `1min`, `2h`, `3d`, or `1w`.",
    );
    return;
  }

  const staff = canCastUwuify(caster);
  if (!staff) {
    const cd = getInvisibleCastCooldownRemaining(caster.id);
    if (cd > 0) {
      await message.reply(
        `Slow down — you can use \`!invisible\` again in **${formatInvisibleDuration(cd)}**.`,
      );
      return;
    }
  }

  if (!staff && durationMs > INVISIBLE_MYTHIC_MAX_MS) {
    await message.reply(
      `Mythic holders can only use invisible for up to **${formatInvisibleDuration(INVISIBLE_MYTHIC_MAX_MS)}**.`,
    );
    return;
  }

  // Admins can only be made invisible for up to 1 minute; everyone else keeps custom duration.
  const ADMIN_TARGET_MAX_MS = 60_000;
  if (isDiscordAdmin(target) && durationMs > ADMIN_TARGET_MAX_MS) {
    await message.reply(
      `Admins can only be made invisible for up to **${formatInvisibleDuration(ADMIN_TARGET_MAX_MS)}**.`,
    );
    return;
  }

  const capped = Math.min(durationMs, STAFF_MAX_MS);
  const finalMs = capped || INVISIBLE_DEFAULT_DURATION_MS;

  setInvisibleSession(target.id, {
    expiresAt: Date.now() + finalMs,
    appliedBy: caster.id,
    guildId: message.guildId,
  });
  if (!staff) markInvisibleCast(caster.id);

  await message.reply({
    embeds: [
      buildInvisibleEmbed({ targetId: target.id, durationMs: finalMs }),
    ],
    allowedMentions: { users: [target.id] },
  });
}
